import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, Group, Lesson } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

type TeacherWithStats = Profile & {
  groups: Group[]
  totalStudents: number
  totalLessons: number
}

type LessonWithAttendance = Lesson & {
  groupName: string
  moduleName: string
  teacherName: string
  presentStudents: string[]
  absentStudents: string[]
  is_completed: boolean
}

export function AdminDashboard() {
  const [teachers, setTeachers] = useState<TeacherWithStats[]>([])
  const [allLessons, setAllLessons] = useState<LessonWithAttendance[]>([])
  const [showCreateTeacher, setShowCreateTeacher] = useState(false)
  const [newTeacherName, setNewTeacherName] = useState('')
  const [newTeacherPrice, setNewTeacherPrice] = useState('')
  const [newTeacherBonus, setNewTeacherBonus] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherWithStats | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [editBonus, setEditBonus] = useState('')
  const [activeTab, setActiveTab] = useState<'teachers' | 'schedule'>('teachers')
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterCompleted, setFilterCompleted] = useState<'all' | 'completed' | 'pending'>('all')
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
        await Promise.all([loadTeachers(), loadAllLessons()])
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
      .select('id, teacher_id, name, invite_code')
      .in('teacher_id', teacherIds)

    const groupIds: string[] = []
    if (groupsData) {
      groupsData.forEach(g => groupIds.push(g.id))
    }

    let studentCounts: Record<string, number> = {}
    if (groupIds.length > 0) {
      const { data: studentsData } = await supabase
        .from('profiles')
        .select('group_id')
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

    const lessonCountByTeacher: Record<string, number> = {}
    if (groupsData) {
      for (const g of groupsData) {
        const { count } = await supabase
          .from('lessons')
          .select('*', { count: 'exact', head: true })
          .eq('group_id', g.id)
        if (count) {
          lessonCountByTeacher[g.teacher_id] = (lessonCountByTeacher[g.teacher_id] || 0) + count
        }
      }
    }

    const teachersWithStats: TeacherWithStats[] = teachersData.map(teacher => ({
      ...teacher,
      groups: groupsData?.filter(g => g.teacher_id === teacher.id) || [],
      totalStudents: totalStudentsPerTeacher[teacher.id] || 0,
      totalLessons: lessonCountByTeacher[teacher.id] || 0,
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
        ? supabase.from('profiles').select('id, group_id, name').eq('role', 'student').in('group_id', groupIds)
        : { data: [] },
      lessonIds.length > 0
        ? supabase.from('attendance').select('lesson_id, student_id, present').in('lesson_id', lessonIds)
        : { data: [] },
    ])

    const teacherMap: Record<string, string> = {}
    if (teachersRes.data) {
      teachersRes.data.forEach((t: any) => { teacherMap[t.id] = t.name })
    }

    const studentsByGroup: Record<string, { id: string; name: string }[]> = {}
    if (studentsRes.data) {
      studentsRes.data.forEach((s: any) => {
        if (!studentsByGroup[s.group_id]) studentsByGroup[s.group_id] = []
        studentsByGroup[s.group_id].push({ id: s.id, name: s.name })
      })
    }

    const attendanceByLesson: Record<string, Record<string, boolean>> = {}
    if (attendanceRes.data) {
      attendanceRes.data.forEach((a: any) => {
        if (!attendanceByLesson[a.lesson_id]) attendanceByLesson[a.lesson_id] = {}
        attendanceByLesson[a.lesson_id][a.student_id] = a.present
      })
    }

    const lessonsWithAttendance: LessonWithAttendance[] = lessons.map(lesson => {
      const group = lesson.groups as any
      const module = lesson.modules as any
      const students = studentsByGroup[lesson.group_id] || []
      const att = attendanceByLesson[lesson.id] || {}

      const presentStudents = students.filter(s => att[s.id] === true).map(s => s.name)
      const absentStudents = students.filter(s => att[s.id] !== true).map(s => s.name)

      return {
        ...lesson,
        groupName: group?.name || '-',
        moduleName: module?.name || '-',
        teacherName: teacherMap[group?.teacher_id] || '-',
        presentStudents,
        absentStudents,
      }
    })

    setAllLessons(lessonsWithAttendance)
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
        price_per_lesson: newTeacherPrice ? parseFloat(newTeacherPrice) : 0,
        bonus_per_student: newTeacherBonus ? parseFloat(newTeacherBonus) : 0,
      })

    if (error) {
      alert('Ошибка: ' + error.message)
      return
    }

    alert(`Преподаватель создан!\n\nЛогин: ${loginCode}\n\nСохраните этот код!`)
    setNewTeacherName('')
    setNewTeacherPrice('')
    setNewTeacherBonus('')
    setShowCreateTeacher(false)
    loadTeachers()
  }

  const handleSaveTeacherPrices = async () => {
    if (!selectedTeacher) return

    const { error } = await supabase
      .from('profiles')
      .update({
        price_per_lesson: editPrice ? parseFloat(editPrice) : 0,
        bonus_per_student: editBonus ? parseFloat(editBonus) : 0,
      })
      .eq('id', selectedTeacher.id)

    if (!error) {
      loadTeachers()
      setSelectedTeacher(prev => prev ? {
        ...prev,
        price_per_lesson: editPrice ? parseFloat(editPrice) : 0,
        bonus_per_student: editBonus ? parseFloat(editBonus) : 0,
      } : null)
    }
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
    if (filterCompleted === 'completed' && !l.is_completed) return false
    if (filterCompleted === 'pending' && l.is_completed) return false
    return true
  })

  const uniqueTeacherNames = [...new Set(allLessons.map(l => l.teacherName))]
  const uniqueGroupNames = [...new Set(allLessons.map(l => l.groupName))]

  const formatPrice = (val: number | null) => {
    if (!val || val === 0) return '0 ₽'
    return `${val.toLocaleString('ru-RU')} ₽`
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
              <div className="form-row-3">
                <div className="form-field">
                  <label className="form-label">Цена за урок (₽)</label>
                  <input
                    type="number"
                    value={newTeacherPrice}
                    onChange={(e) => setNewTeacherPrice(e.target.value)}
                    placeholder="0"
                    className="input"
                    min="0"
                    step="0.01"
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">Бонус за ученика (₽)</label>
                  <input
                    type="number"
                    value={newTeacherBonus}
                    onChange={(e) => setNewTeacherBonus(e.target.value)}
                    placeholder="0"
                    className="input"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
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
                <button onClick={() => setSelectedTeacher(null)} className="btn btn-back">
                  &larr; Назад к списку
                </button>
                <h3 className="teacher-detail-name">{selectedTeacher.full_name || selectedTeacher.name}</h3>
                <button
                  onClick={() => {
                    if (confirm('Удалить преподавателя и все его группы, модули, уроки?')) {
                      handleDeleteTeacher(selectedTeacher.id)
                    }
                  }}
                  className="btn-delete-teacher"
                  title="Удалить преподавателя"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4l8 8M12 4l-8 8"/>
                  </svg>
                </button>
              </div>

              <div className="teacher-info-grid">
                <div className="info-card">
                  <span className="info-label">Код входа</span>
                  <code className="info-value">{selectedTeacher.login_code || '-'}</code>
                </div>
                <div className="info-card">
                  <span className="info-label">Цена за урок</span>
                  <span className="info-value price">{formatPrice(selectedTeacher.price_per_lesson)}</span>
                </div>
                <div className="info-card">
                  <span className="info-label">Бонус за ученика</span>
                  <span className="info-value bonus">{formatPrice(selectedTeacher.bonus_per_student)}</span>
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

              <div className="teacher-prices-edit">
                <h4>Настройки цен</h4>
                <div className="form-row-3">
                  <div className="form-field">
                    <label className="form-label">Цена за урок (₽)</label>
                    <input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="input"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="form-field">
                    <label className="form-label">Бонус за ученика (₽)</label>
                    <input
                      type="number"
                      value={editBonus}
                      onChange={(e) => setEditBonus(e.target.value)}
                      className="input"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <button onClick={handleSaveTeacherPrices} className="btn btn-primary btn-sm">
                  Сохранить цены
                </button>
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

              <h4>Занятия и посещаемость</h4>
              {(() => {
                const teacherLessons = allLessons.filter(l =>
                  selectedTeacher.groups.some(g => l.groupName === g.name) && l.is_completed
                )

                if (teacherLessons.length === 0) {
                  return <p className="empty-text">Занятий пока нет</p>
                }

                return (
                  <div className="attendance-grid">
                    <div className="attendance-grid-header">
                      <span className="ag-col-date">Дата</span>
                      <span className="ag-col-topic">Урок</span>
                      <span className="ag-col-group">Группа</span>
                      <span className="ag-col-students">Ученики</span>
                    </div>
                    {teacherLessons.map(lesson => (
                      <div key={lesson.id} className="attendance-grid-row">
                        <span className="ag-col-date">
                          {new Date(lesson.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </span>
                        <span className="ag-col-topic">
                          {lesson.lesson_number}. {lesson.topic}
                        </span>
                        <span className="ag-col-group">{lesson.groupName}</span>
                        <span className="ag-col-students">
                          {lesson.presentStudents.length > 0 ? (
                            lesson.presentStudents.map((name, i) => (
                              <span key={i} className="ag-student present">{name}</span>
                            ))
                          ) : (
                            <span className="ag-no-students">—</span>
                          )}
                          {lesson.absentStudents.length > 0 && (
                            <span className="ag-absent-sep">/ </span>
                          )}
                          {lesson.absentStudents.map((name, i) => (
                            <span key={i} className="ag-student absent">{name}</span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })()}
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
                  <div key={teacher.id} className="teacher-card" onClick={() => {
                    setSelectedTeacher(teacher)
                    setEditPrice(String(teacher.price_per_lesson || 0))
                    setEditBonus(String(teacher.bonus_per_student || 0))
                  }}>
                    <div className="teacher-card-info">
                      <span className="teacher-avatar">{(teacher.full_name || teacher.name).charAt(0)}</span>
                      <div>
                        <div className="teacher-card-name">{teacher.full_name || teacher.name}</div>
                        <div className="teacher-card-code">Код: {teacher.login_code || '-'}</div>
                      </div>
                    </div>
                    <div className="teacher-card-prices">
                      <span className="teacher-price-item">{formatPrice(teacher.price_per_lesson)}/урок</span>
                      <span className="teacher-price-item bonus">{formatPrice(teacher.bonus_per_student)}/уч.</span>
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
            <select value={filterCompleted} onChange={e => setFilterCompleted(e.target.value as any)} className="input filter-input">
              <option value="all">Все статусы</option>
              <option value="completed">Завершённые</option>
              <option value="pending">В процессе</option>
            </select>
            {(filterTeacher || filterGroup || filterDateFrom || filterDateTo || filterCompleted !== 'all') && (
              <button
                onClick={() => { setFilterTeacher(''); setFilterGroup(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterCompleted('all'); }}
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
                <div key={lesson.id} className={`schedule-item ${lesson.is_completed ? 'schedule-completed' : ''}`}>
                  <div className="schedule-date">
                    {new Date(lesson.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="schedule-info">
                    <div className="schedule-topic">
                      Урок {lesson.lesson_number}: {lesson.topic}
                      {lesson.is_completed && <span className="badge badge-green badge-sm">Завершён</span>}
                    </div>
                    <div className="schedule-meta">
                      {lesson.teacherName} / {lesson.groupName} / {lesson.moduleName}
                    </div>
                    <div className="schedule-students-row">
                      {lesson.presentStudents.map((name, i) => (
                        <span key={i} className="ag-student present">{name}</span>
                      ))}
                      {lesson.absentStudents.length > 0 && (
                        <span className="ag-absent-sep">/ </span>
                      )}
                      {lesson.absentStudents.map((name, i) => (
                        <span key={i} className="ag-student absent">{name}</span>
                      ))}
                    </div>
                  </div>
                  <div className="schedule-attendance">
                    <span className={lesson.presentStudents.length > 0 && lesson.absentStudents.length === 0 ? 'all-present' : ''}>
                      {lesson.presentStudents.length}/{lesson.presentStudents.length + lesson.absentStudents.length}
                    </span>
                    <span className="attendance-label">посещ.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </>)}
    </div>
  )
}
