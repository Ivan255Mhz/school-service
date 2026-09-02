import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, Group, Lesson } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

type TeacherWithStats = Profile & {
  groups: Group[]
  totalStudents: number
  totalLessons: number
}

type LessonWithStats = Lesson & {
  groupName: string
  moduleName: string
  presentCount: number
  totalCount: number
}

export function AdminDashboard() {
  const [teachers, setTeachers] = useState<TeacherWithStats[]>([])
  const [allLessons, setAllLessons] = useState<LessonWithStats[]>([])
  const [allStudents, setAllStudents] = useState<Profile[]>([])
  const [showCreateTeacher, setShowCreateTeacher] = useState(false)
  const [newTeacherName, setNewTeacherName] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherWithStats | null>(null)
  const [activeTab, setActiveTab] = useState<'teachers' | 'schedule' | 'students'>('teachers')
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) {
      navigate('/')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      navigate('/')
      return
    }

    await loadTeachers()
    await loadAllLessons()
    await loadAllStudents()
  }

  const loadTeachers = async () => {
    const { data: teachersData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'teacher')

    if (!teachersData) return

    const teachersWithStats: TeacherWithStats[] = []

    for (const teacher of teachersData) {
      const { data: groups } = await supabase
        .from('groups')
        .select('*')
        .eq('teacher_id', teacher.id)

      let totalStudents = 0
      let totalLessons = 0

      if (groups) {
        for (const group of groups) {
          const { count: studentCount } = await supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id)
            .eq('role', 'student')

          const { count: lessonCount } = await supabase
            .from('lessons')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', group.id)

          totalStudents += studentCount || 0
          totalLessons += lessonCount || 0
        }
      }

      teachersWithStats.push({
        ...teacher,
        groups: groups || [],
        totalStudents,
        totalLessons,
      })
    }

    setTeachers(teachersWithStats)
  }

  const loadAllLessons = async () => {
    const { data: lessons } = await supabase
      .from('lessons')
      .select('*')
      .order('date', { ascending: false })

    if (!lessons) return

    const lessonsWithStats: LessonWithStats[] = []

    for (const lesson of lessons) {
      const { data: group } = await supabase
        .from('groups')
        .select('name')
        .eq('id', lesson.group_id)
        .single()

      const { data: module } = await supabase
        .from('modules')
        .select('name')
        .eq('id', lesson.module_id)
        .single()

      const { count: totalCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', lesson.group_id)
        .eq('role', 'student')

      const { count: presentCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('lesson_id', lesson.id)
        .eq('present', true)

      lessonsWithStats.push({
        ...lesson,
        groupName: group?.name || '-',
        moduleName: module?.name || '-',
        presentCount: presentCount || 0,
        totalCount: totalCount || 0,
      })
    }

    setAllLessons(lessonsWithStats)
  }

  const loadAllStudents = async () => {
    const { data: students } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')

    if (students) setAllStudents(students)
  }

  const generateLoginCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'TCH-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault()

    const loginCode = generateLoginCode()

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('login_code', loginCode)
      .single()

    if (existing) {
      alert('Код уже существует, попробуйте снова')
      return
    }

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: crypto.randomUUID(),
        name: newTeacherName,
        full_name: newTeacherName,
        role: 'teacher',
        login_code: loginCode,
      })

    if (error) {
      alert('Ошибка: ' + error.message)
      return
    }

    alert(`Преподаватель создан!\n\nЛогин: ${loginCode}\n\nСохраните этот код!`)
    setNewTeacherName('')
    setShowCreateTeacher(false)
    loadTeachers()
  }

  const handleDeleteTeacher = async (teacherId: string) => {
    if (!confirm('Удалить преподавателя?')) return
    await supabase.from('profiles').delete().eq('id', teacherId)
    setSelectedTeacher(null)
    loadTeachers()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.clear()
    navigate('/')
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Админ-панель</h1>
          <p>Управление преподавателями и статистика</p>
        </div>
        <button onClick={handleLogout} className="btn btn-outline">
          Выйти
        </button>
      </header>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'teachers' ? 'active' : ''}`}
          onClick={() => setActiveTab('teachers')}
        >
          Преподаватели ({teachers.length})
        </button>
        <button
          className={`tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          Расписание
        </button>
        <button
          className={`tab ${activeTab === 'students' ? 'active' : ''}`}
          onClick={() => setActiveTab('students')}
        >
          Все ученики ({allStudents.length})
        </button>
      </div>

      {activeTab === 'teachers' && (
        <div className="teacher-section">
          <div className="section-header">
            <h2>Преподаватели</h2>
            <button onClick={() => setShowCreateTeacher(true)} className="btn btn-primary btn-sm">
              + Создать преподавателя
            </button>
          </div>

          {showCreateTeacher && (
            <form onSubmit={handleCreateTeacher} className="create-form">
              <input
                type="text"
                value={newTeacherName}
                onChange={(e) => setNewTeacherName(e.target.value)}
                placeholder="ФИО преподавателя"
                className="input"
                required
              />
              <div className="form-hint">Код для входа будет сгенерирован автоматически</div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-sm">Создать</button>
                <button type="button" onClick={() => setShowCreateTeacher(false)} className="btn btn-outline btn-sm">
                  Отмена
                </button>
              </div>
            </form>
          )}

          {selectedTeacher && (
            <div className="teacher-detail">
              <div className="teacher-detail-header">
                <h3>{selectedTeacher.full_name || selectedTeacher.name}</h3>
                <button onClick={() => setSelectedTeacher(null)} className="btn btn-back">
                  &larr; Назад к списку
                </button>
              </div>

              <div className="teacher-info-grid">
                <div className="info-card">
                  <span className="info-label">Код входа</span>
                  <code className="info-value">{selectedTeacher.login_code || '-'}</code>
                </div>
                <div className="info-card">
                  <span className="info-label">Группы</span>
                  <span className="info-value">{selectedTeacher.groups.length}</span>
                </div>
                <div className="info-card">
                  <span className="info-label">Ученики</span>
                  <span className="info-value">{selectedTeacher.totalStudents}</span>
                </div>
                <div className="info-card">
                  <span className="info-label">Уроки</span>
                  <span className="info-value">{selectedTeacher.totalLessons}</span>
                </div>
              </div>

              <h4>Группы преподавателя</h4>
              {selectedTeacher.groups.length === 0 ? (
                <p className="empty-text">Групп нет</p>
              ) : (
                <div className="groups-list">
                  {selectedTeacher.groups.map(group => (
                    <div key={group.id} className="group-item">
                      <span className="group-name">{group.name}</span>
                      <code className="group-code-small">{group.invite_code}</code>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => handleDeleteTeacher(selectedTeacher.id)}
                className="btn btn-danger"
              >
                Удалить преподавателя
              </button>
            </div>
          )}

          {!selectedTeacher && (
            <div className="teachers-list">
              {teachers.length === 0 ? (
                <div className="empty-state">
                  <p>Преподавателей пока нет.</p>
                </div>
              ) : (
                teachers.map(teacher => (
                  <div key={teacher.id} className="teacher-card" onClick={() => setSelectedTeacher(teacher)}>
                    <div className="teacher-card-info">
                      <span className="teacher-avatar">{(teacher.full_name || teacher.name).charAt(0)}</span>
                      <div>
                        <div className="teacher-card-name">{teacher.full_name || teacher.name}</div>
                        <div className="teacher-card-code">Код: {teacher.login_code || '-'}</div>
                      </div>
                    </div>
                    <div className="teacher-card-stats">
                      <span>{teacher.groups.length} групп</span>
                      <span>{teacher.totalStudents} учеников</span>
                      <span>{teacher.totalLessons} уроков</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="teacher-section">
          <h2>Расписание занятий</h2>
          {allLessons.length === 0 ? (
            <div className="empty-state">
              <p>Занятий пока нет.</p>
            </div>
          ) : (
            <div className="schedule-list">
              {allLessons.map(lesson => (
                <div key={lesson.id} className="schedule-item">
                  <div className="schedule-date">
                    {new Date(lesson.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="schedule-info">
                    <div className="schedule-topic">Урок {lesson.lesson_number}: {lesson.topic}</div>
                    <div className="schedule-meta">
                      {lesson.groupName} / {lesson.moduleName}
                    </div>
                  </div>
                  <div className="schedule-attendance">
                    <span className={lesson.presentCount === lesson.totalCount ? 'all-present' : ''}>
                      {lesson.presentCount}/{lesson.totalCount}
                    </span>
                    <span className="attendance-label">посещ.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'students' && (
        <div className="teacher-section">
          <h2>Все ученики</h2>
          {allStudents.length === 0 ? (
            <div className="empty-state">
              <p>Учеников пока нет.</p>
            </div>
          ) : (
            <div className="students-table-wrap">
              <table className="students-table">
                <thead>
                  <tr>
                    <th>Имя</th>
                    <th>Группа</th>
                  </tr>
                </thead>
                <tbody>
                  {allStudents.map(student => (
                    <tr key={student.id}>
                      <td>{student.name}</td>
                      <td>{student.group_id ? student.group_id.slice(0, 8) + '...' : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
