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
  teacherName: string
  presentCount: number
  totalCount: number
}

type StudentWithStats = Profile & {
  groupName: string
  teacherName: string
  totalLessons: number
  attendedLessons: number
  submittedHomework: number
  totalHomework: number
}

export function AdminDashboard() {
  const [teachers, setTeachers] = useState<TeacherWithStats[]>([])
  const [allLessons, setAllLessons] = useState<LessonWithStats[]>([])
  const [allStudents, setAllStudents] = useState<StudentWithStats[]>([])
  const [showCreateTeacher, setShowCreateTeacher] = useState(false)
  const [newTeacherName, setNewTeacherName] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherWithStats | null>(null)
  const [activeTab, setActiveTab] = useState<'teachers' | 'schedule' | 'students'>('teachers')
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const role = localStorage.getItem('user_role')
    if (role !== 'admin') {
      navigate('/')
      return
    }
    (async () => {
      try {
        setLoading(true)
        await Promise.all([loadTeachers(), loadAllLessons(), loadAllStudents()])
      } catch (e) {
        console.error('Load error:', e)
        setError('Ошибка загрузки данных')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const loadTeachers = async () => {
    const { data: teachersData } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'teacher')

    if (!teachersData) return

    const teacherIds = teachersData.map(t => t.id)
    if (teacherIds.length === 0) { setTeachers([]); return }

    const { data: groupsData } = await supabase
      .from('groups')
      .select('id, teacher_id')
      .in('teacher_id', teacherIds)

    const groupCounts: Record<string, number> = {}
    const groupIds: string[] = []
    if (groupsData) {
      groupsData.forEach(g => {
        groupCounts[g.teacher_id] = (groupCounts[g.teacher_id] || 0) + 1
        groupIds.push(g.id)
      })
    }

    let studentCounts: Record<string, number> = {}
    if (groupIds.length > 0) {
      const { data: studentsData } = await supabase
        .from('profiles')
        .select('id, group_id')
        .eq('role', 'student')
        .in('group_id', groupIds)
      if (studentsData) {
        studentsData.forEach(s => {
          studentCounts[s.group_id] = (studentCounts[s.group_id] || 0) + 1
        })
      }
    }

    let totalStudentsPerTeacher: Record<string, number> = {}
    if (groupsData) {
      groupsData.forEach(g => {
        totalStudentsPerTeacher[g.teacher_id] = (totalStudentsPerTeacher[g.teacher_id] || 0) + (studentCounts[g.id] || 0)
      })
    }

    const { count: totalLessons } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })

    const teachersWithStats: TeacherWithStats[] = teachersData.map(teacher => ({
      ...teacher,
      groups: groupsData?.filter(g => g.teacher_id === teacher.id) || [],
      totalStudents: totalStudentsPerTeacher[teacher.id] || 0,
      totalLessons: totalLessons || 0,
    }))

    setTeachers(teachersWithStats)
  }

  const loadAllLessons = async () => {
    const { data: lessons } = await supabase
      .from('lessons')
      .select('*, groups(name, teacher_id), modules(name)')
      .order('date', { ascending: false })

    if (!lessons) return

    const groupIds = [...new Set(lessons.map(l => l.group_id).filter(Boolean))]
    const teacherIds = [...new Set(lessons.map(l => (l.groups as any)?.teacher_id).filter(Boolean))]
    const lessonIds = lessons.map(l => l.id)

    const [teachersRes, studentsRes, attendanceRes] = await Promise.all([
      teacherIds.length > 0
        ? supabase.from('profiles').select('id, name').in('id', teacherIds)
        : { data: [] },
      groupIds.length > 0
        ? supabase.from('profiles').select('group_id').eq('role', 'student').in('group_id', groupIds)
        : { data: [] },
      lessonIds.length > 0
        ? supabase.from('attendance').select('lesson_id').eq('present', true).in('lesson_id', lessonIds)
        : { data: [] },
    ])

    const teacherMap: Record<string, string> = {}
    if (teachersRes.data) {
      teachersRes.data.forEach((t: any) => { teacherMap[t.id] = t.name })
    }

    const studentCountByGroup: Record<string, number> = {}
    if (studentsRes.data) {
      studentsRes.data.forEach((s: any) => {
        studentCountByGroup[s.group_id] = (studentCountByGroup[s.group_id] || 0) + 1
      })
    }

    const presentCountByLesson: Record<string, number> = {}
    if (attendanceRes.data) {
      attendanceRes.data.forEach((a: any) => {
        presentCountByLesson[a.lesson_id] = (presentCountByLesson[a.lesson_id] || 0) + 1
      })
    }

    const lessonsWithStats: LessonWithStats[] = lessons.map(lesson => {
      const group = lesson.groups as any
      const module = lesson.modules as any
      return {
        ...lesson,
        groupName: group?.name || '-',
        moduleName: module?.name || '-',
        teacherName: teacherMap[group?.teacher_id] || '-',
        presentCount: presentCountByLesson[lesson.id] || 0,
        totalCount: studentCountByGroup[lesson.group_id] || 0,
      }
    })

    setAllLessons(lessonsWithStats)
  }

  const loadAllStudents = async () => {
    const { data: students } = await supabase
      .from('profiles')
      .select('*, groups(name, teacher_id)')
      .eq('role', 'student')

    if (!students) {
      setAllStudents([])
      return
    }

    const groupIds = [...new Set(students.map(s => s.group_id).filter(Boolean))]
    const teacherIds = [...new Set(students.map(s => (s.groups as any)?.teacher_id).filter(Boolean))]
    const studentIds = students.map(s => s.id)

    const [teachersRes, lessonsRes, attendanceRes, homeworkRes] = await Promise.all([
      teacherIds.length > 0
        ? supabase.from('profiles').select('id, name').in('id', teacherIds)
        : { data: [] },
      groupIds.length > 0
        ? supabase.from('lessons').select('id, group_id').in('group_id', groupIds)
        : { data: [] },
      studentIds.length > 0
        ? supabase.from('attendance').select('student_id').eq('present', true).in('student_id', studentIds)
        : { data: [] },
      studentIds.length > 0
        ? supabase.from('homework').select('student_id').in('student_id', studentIds)
        : { data: [] },
    ])

    const teacherMap: Record<string, string> = {}
    if (teachersRes.data) {
      teachersRes.data.forEach((t: any) => { teacherMap[t.id] = t.name })
    }

    const lessonCountByGroup: Record<string, number> = {}
    if (lessonsRes.data) {
      lessonsRes.data.forEach((l: any) => {
        lessonCountByGroup[l.group_id] = (lessonCountByGroup[l.group_id] || 0) + 1
      })
    }

    const attendanceCountByStudent: Record<string, number> = {}
    if (attendanceRes.data) {
      attendanceRes.data.forEach((a: any) => {
        attendanceCountByStudent[a.student_id] = (attendanceCountByStudent[a.student_id] || 0) + 1
      })
    }

    const homeworkCountByStudent: Record<string, number> = {}
    if (homeworkRes.data) {
      homeworkRes.data.forEach((h: any) => {
        homeworkCountByStudent[h.student_id] = (homeworkCountByStudent[h.student_id] || 0) + 1
      })
    }

    const studentsWithStats: StudentWithStats[] = students.map(student => {
      const group = student.groups as any
      return {
        ...student,
        groupName: group?.name || '-',
        teacherName: teacherMap[group?.teacher_id] || '-',
        totalLessons: lessonCountByGroup[student.group_id] || 0,
        attendedLessons: attendanceCountByStudent[student.id] || 0,
        submittedHomework: homeworkCountByStudent[student.id] || 0,
        totalHomework: lessonCountByGroup[student.group_id] || 0,
      }
    })

    setAllStudents(studentsWithStats)
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
      .maybeSingle()

    if (existing) {
      alert('Код уже существует, попробуйте снова')
      return
    }

    const newId = crypto.randomUUID()

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: newId,
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
    setTeachers(prev => [...prev, {
      id: newId,
      name: newTeacherName,
      full_name: newTeacherName,
      role: 'teacher' as const,
      login_code: loginCode,
      group_id: null,
      invite_code: null,
      groups: [],
      totalStudents: 0,
      totalLessons: 0,
    }])
  }

  const handleDeleteTeacher = async (teacherId: string) => {
    if (!confirm('Удалить преподавателя и все его группы, модули, уроки?')) return

    const { data: groups } = await supabase
      .from('groups')
      .select('id')
      .eq('teacher_id', teacherId)

    if (groups && groups.length > 0) {
      const groupIds = groups.map(g => g.id)

      const { data: modules } = await supabase
        .from('modules')
        .select('id')
        .in('group_id', groupIds)

      if (modules && modules.length > 0) {
        const moduleIds = modules.map(m => m.id)

        const { data: lessons } = await supabase
          .from('lessons')
          .select('id')
          .in('module_id', moduleIds)

        if (lessons && lessons.length > 0) {
          const lessonIds = lessons.map(l => l.id)
          await supabase.from('attendance').delete().in('lesson_id', lessonIds)
          await supabase.from('homework').delete().in('lesson_id', lessonIds)
          await supabase.from('lesson_materials').delete().in('lesson_id', lessonIds)
        }

        await supabase.from('lessons').delete().in('module_id', moduleIds)
      }

      await supabase.from('modules').delete().in('group_id', groupIds)
      await supabase.from('profiles').delete().eq('role', 'student').in('group_id', groupIds)
      await supabase.from('groups').delete().eq('teacher_id', teacherId)
    }

    await supabase.from('profiles').delete().eq('id', teacherId)
    setSelectedTeacher(null)
    loadTeachers()
    loadAllStudents()
    loadAllLessons()
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.clear()
    navigate('/')
  }

  const filteredLessons = allLessons.filter(l => {
    if (filterTeacher && l.teacherName !== filterTeacher) return false
    if (filterGroup && l.groupName !== filterGroup) return false
    if (filterDateFrom && l.date < filterDateFrom) return false
    if (filterDateTo && l.date > filterDateTo) return false
    return true
  })

  const uniqueTeacherNames = [...new Set(allLessons.map(l => l.teacherName))]
  const uniqueGroupNames = [...new Set(allLessons.map(l => l.groupName))]

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

      {loading && <div className="empty-state"><p>Загрузка...</p></div>}
      {error && <div className="empty-state"><p style={{color:'#ef4444'}}>{error}</p></div>}

      {!loading && !error && (<>
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
          Расписание ({allLessons.length})
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

              <div className="teacher-detail-actions">
                <button
                  onClick={() => handleDeleteTeacher(selectedTeacher.id)}
                  className="btn btn-danger btn-xs"
                  title="Удалить преподавателя"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2l8 8M10 2l-8 8"/>
                  </svg>
                </button>
              </div>
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

          <div className="filters-bar">
            <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)} className="input filter-input">
              <option value="">Все преподаватели</option>
              {uniqueTeacherNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)} className="input filter-input">
              <option value="">Все группы</option>
              {uniqueGroupNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <input
              type="date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="input filter-input"
              placeholder="От"
            />
            <input
              type="date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="input filter-input"
              placeholder="До"
            />
            {(filterTeacher || filterGroup || filterDateFrom || filterDateTo) && (
              <button
                onClick={() => { setFilterTeacher(''); setFilterGroup(''); setFilterDateFrom(''); setFilterDateTo(''); }}
                className="btn btn-outline btn-sm"
              >
                Сбросить
              </button>
            )}
          </div>

          {filteredLessons.length === 0 ? (
            <div className="empty-state">
              <p>{allLessons.length === 0 ? 'Занятий пока нет.' : 'Нет занятий по заданным фильтрам.'}</p>
            </div>
          ) : (
            <div className="schedule-list">
              {filteredLessons.map(lesson => (
                <div key={lesson.id} className="schedule-item">
                  <div className="schedule-date">
                    {new Date(lesson.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="schedule-info">
                    <div className="schedule-topic">Урок {lesson.lesson_number}: {lesson.topic}</div>
                    <div className="schedule-meta">
                      {lesson.teacherName} / {lesson.groupName} / {lesson.moduleName}
                    </div>
                  </div>
                  <div className="schedule-attendance">
                    <span className={lesson.presentCount === lesson.totalCount && lesson.totalCount > 0 ? 'all-present' : ''}>
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
                    <th>Преподаватель</th>
                    <th>Посещаемость</th>
                    <th>ДЗ сдано</th>
                  </tr>
                </thead>
                <tbody>
                  {allStudents.map(student => {
                    const attPercent = student.totalLessons > 0
                      ? Math.round((student.attendedLessons / student.totalLessons) * 100)
                      : 0
                    return (
                      <tr key={student.id}>
                        <td>{student.name}</td>
                        <td>{student.groupName}</td>
                        <td>{student.teacherName}</td>
                        <td>
                          <span className={`att-badge ${attPercent >= 75 ? 'green' : attPercent >= 50 ? 'yellow' : 'red'}`}>
                            {student.attendedLessons}/{student.totalLessons} ({attPercent}%)
                          </span>
                        </td>
                        <td>
                          {student.submittedHomework}/{student.totalHomework}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </>)}
    </div>
  )
}
