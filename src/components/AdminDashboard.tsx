import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, Group, Lesson, LibraryItem } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { showToast } from './Toast'

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
  const [activeTab, setActiveTab] = useState<'teachers' | 'schedule' | 'payments' | 'library'>('teachers')
  const [filterTeacher, setFilterTeacher] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterCompleted, setFilterCompleted] = useState<'all' | 'completed' | 'pending'>('all')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])
  const [libraryGroups, setLibraryGroups] = useState<Group[]>([])
  const [showAddLibraryItem, setShowAddLibraryItem] = useState(false)
  const [newLibType, setNewLibType] = useState<'book' | 'article' | 'link'>('book')
  const [newLibTitle, setNewLibTitle] = useState('')
  const [newLibDesc, setNewLibDesc] = useState('')
  const [newLibUrl, setNewLibUrl] = useState('')
  const [newLibGroupId, setNewLibGroupId] = useState('')
  const [newLibFile, setNewLibFile] = useState<File | null>(null)
  const [uploadingLib, setUploadingLib] = useState(false)
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
        await Promise.all([loadTeachers(), loadAllLessons(), loadLibrary()])
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

  const loadLibrary = async () => {
    const { data: libData } = await supabase
      .from('library_items')
      .select('*')
      .order('created_at', { ascending: false })

    if (libData) setLibraryItems(libData)

    const { data: groupsData } = await supabase
      .from('groups')
      .select('id, name, invite_code, teacher_id')

    if (groupsData) setLibraryGroups(groupsData)
  }

  const handleAddLibraryItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newLibGroupId || !newLibTitle.trim()) return

    setUploadingLib(true)
    let fileUrl = ''
    let fileName = ''

    if (newLibFile) {
      const ext = newLibFile.name.split('.').pop()
      const path = `library/${Date.now()}.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('library')
        .upload(path, newLibFile)

      if (uploadErr) {
        showToast('error', 'Ошибка загрузки файла')
        setUploadingLib(false)
        return
      }

      const { data: urlData } = supabase.storage.from('library').getPublicUrl(path)
      fileUrl = urlData.publicUrl
      fileName = newLibFile.name
    }

    const { error } = await supabase.from('library_items').insert({
      group_id: newLibGroupId,
      type: newLibType,
      title: newLibTitle.trim(),
      description: newLibDesc.trim() || null,
      url: (newLibType === 'article' || newLibType === 'link') ? newLibUrl.trim() || null : null,
      file_url: fileUrl || null,
      file_name: fileName || null,
      added_by: localStorage.getItem('admin_id') || null,
    })

    if (error) {
      showToast('error', 'Не удалось добавить материал')
    } else {
      showToast('success', 'Материал добавлен')
      setNewLibTitle('')
      setNewLibDesc('')
      setNewLibUrl('')
      setNewLibFile(null)
      setNewLibGroupId('')
      setShowAddLibraryItem(false)
      loadLibrary()
    }
    setUploadingLib(false)
  }

  const handleDeleteLibraryItem = async (itemId: string) => {
    if (!confirm('Удалить материал из библиотеки?')) return
    const { error } = await supabase.from('library_items').delete().eq('id', itemId)
    if (error) {
      showToast('error', 'Не удалось удалить материал')
    } else {
      showToast('success', 'Материал удалён')
      loadLibrary()
    }
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

    setCreating(true)
    const loginCode = generateLoginCode()
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('login_code', loginCode)
      .maybeSingle()

    if (existing) {
      showToast('error', 'Код уже существует, попробуйте снова')
      setCreating(false)
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
      showToast('error', 'Не удалось создать преподавателя')
      setCreating(false)
      return
    }

    showToast('success', `Преподаватель создан! Логин: ${loginCode}`)
    setNewTeacherName('')
    setNewTeacherPrice('')
    setNewTeacherBonus('')
    setShowCreateTeacher(false)
    loadTeachers()
    setCreating(false)
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

    if (error) {
      showToast('error', 'Не удалось сохранить цены')
    } else {
      showToast('success', 'Цены сохранены')
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

    try {
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
      showToast('success', 'Преподаватель удалён')
      setSelectedTeacher(null)
      loadTeachers()
      loadAllLessons()
    } catch {
      showToast('error', 'Не удалось удалить преподавателя')
    }
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

  if (loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <h1>Админ-панель</h1>
            <p>Управление преподавателями и статистика</p>
          </div>
        </header>
        <div className="tabs">
          <div className="skeleton skeleton-stat" style={{ width: 120, height: 36 }} />
          <div className="skeleton skeleton-stat" style={{ width: 120, height: 36 }} />
          <div className="skeleton skeleton-stat" style={{ width: 120, height: 36 }} />
        </div>
        <div className="groups-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard view-enter">
      <header className="dashboard-header">
        <div>
          <h1>Админ-панель</h1>
          <p>Управление преподавателями и статистика</p>
        </div>
        <button onClick={handleLogout} className="btn btn-outline">
          Выйти
        </button>
      </header>

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
          className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          Оплата
        </button>
        <button
          className={`tab ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          Библиотека
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
                <button type="submit" className="btn btn-primary btn-sm" disabled={creating}>{creating ? '...' : 'Создать'}</button>
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
                  <button key={teacher.id} className="teacher-card" onClick={() => {
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
                  </button>
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

      {activeTab === 'payments' && (() => {
        const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

        type PaymentRow = {
          teacherId: string
          teacherName: string
          month: string
          monthIndex: number
          year: number
          lessonsCount: number
          totalStudents: number
          totalEarnings: number
        }

        const payments: PaymentRow[] = []

        teachers.forEach(teacher => {
          const teacherLessons = allLessons.filter(l =>
            l.is_completed &&
            teacher.groups.some(g => l.groupName === g.name)
          )

          const byMonth: Record<string, { lessons: number; students: number }> = {}

          teacherLessons.forEach(l => {
            const d = new Date(l.date)
            const key = `${d.getFullYear()}-${d.getMonth()}`
            if (!byMonth[key]) byMonth[key] = { lessons: 0, students: 0 }
            byMonth[key].lessons++
            byMonth[key].students += l.presentStudents.length
          })

          Object.entries(byMonth).forEach(([key, data]) => {
            const [year, monthIdx] = key.split('-').map(Number)
            const earnings = (teacher.price_per_lesson || 0) * data.lessons + (teacher.bonus_per_student || 0) * data.students
            payments.push({
              teacherId: teacher.id,
              teacherName: teacher.full_name || teacher.name,
              month: monthNames[monthIdx],
              monthIndex: monthIdx,
              year,
              lessonsCount: data.lessons,
              totalStudents: data.students,
              totalEarnings: earnings,
            })
          })
        })

        payments.sort((a, b) => b.year - a.year || b.monthIndex - a.monthIndex || a.teacherName.localeCompare(b.teacherName))

        return (
          <div className="teacher-section">
            <h2>Оплата преподавателям</h2>

            {payments.length === 0 ? (
              <div className="empty-state">
                <p>Нет завершённых занятий для расчёта.</p>
              </div>
            ) : (
              <div className="payments-table-wrap">
                <table className="payments-table">
                  <thead>
                    <tr>
                      <th>Преподаватель</th>
                      <th>Месяц</th>
                      <th>Уроков</th>
                      <th>Учеников</th>
                      <th>Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={i}>
                        <td className="pay-teacher">{p.teacherName}</td>
                        <td className="pay-month">{p.month} {p.year}</td>
                        <td className="pay-num">{p.lessonsCount}</td>
                        <td className="pay-num">{p.totalStudents}</td>
                        <td className="pay-total">{p.totalEarnings.toLocaleString('ru-RU')} ₽</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })()}
      </>)}

      {activeTab === 'library' && (
        <div className="teacher-section">
          <div className="section-header">
            <h2>Библиотека ({libraryItems.length})</h2>
            <button onClick={() => setShowAddLibraryItem(true)} className="btn btn-primary btn-sm">
              + Добавить материал
            </button>
          </div>

          {showAddLibraryItem && (
            <form onSubmit={handleAddLibraryItem} className="create-form" style={{ marginBottom: 24 }}>
              <div className="form-row">
                <select
                  value={newLibType}
                  onChange={e => setNewLibType(e.target.value as 'book' | 'article' | 'link')}
                  className="input"
                >
                  <option value="book">Книга (PDF)</option>
                  <option value="article">Статья</option>
                  <option value="link">Ссылка</option>
                </select>
                <select
                  value={newLibGroupId}
                  onChange={e => setNewLibGroupId(e.target.value)}
                  className="input"
                  required
                >
                  <option value="">Выберите группу</option>
                  {libraryGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                placeholder="Название"
                value={newLibTitle}
                onChange={e => setNewLibTitle(e.target.value)}
                className="input"
                required
              />
              <input
                type="text"
                placeholder="Описание (необязательно)"
                value={newLibDesc}
                onChange={e => setNewLibDesc(e.target.value)}
                className="input"
              />
              {(newLibType === 'article' || newLibType === 'link') && (
                <input
                  type="url"
                  placeholder="https://..."
                  value={newLibUrl}
                  onChange={e => setNewLibUrl(e.target.value)}
                  className="input"
                />
              )}
              {newLibType === 'book' && (
                <input
                  type="file"
                  accept=".pdf"
                  onChange={e => setNewLibFile(e.target.files?.[0] || null)}
                  className="input"
                />
              )}
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={uploadingLib}>
                  {uploadingLib ? '...' : 'Добавить'}
                </button>
                <button type="button" onClick={() => setShowAddLibraryItem(false)} className="btn btn-outline btn-sm">
                  Отмена
                </button>
              </div>
            </form>
          )}

          {libraryItems.length === 0 ? (
            <div className="empty-state"><p>Библиотека пуста</p></div>
          ) : (
            <div className="library-list">
              {libraryItems.map(item => {
                const group = libraryGroups.find(g => g.id === item.group_id)
                return (
                  <div key={item.id} className="library-item">
                    <div className="library-item-icon">
                      {item.type === 'book' && (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20"/>
                        </svg>
                      )}
                      {(item.type === 'article' || item.type === 'link') && (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                        </svg>
                      )}
                    </div>
                    <div className="library-item-info">
                      <span className="library-item-title">{item.title}</span>
                      <span className="library-item-desc">
                        {group?.name} · {item.type === 'book' ? 'Книга' : item.type === 'article' ? 'Статья' : 'Ссылка'}
                        {item.file_name ? ` · ${item.file_name}` : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteLibraryItem(item.id)}
                      className="btn btn-danger btn-sm"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
