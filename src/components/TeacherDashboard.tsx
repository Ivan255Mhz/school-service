import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Group, Lesson, Profile, Attendance, Homework, LessonMaterial, Module } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export function TeacherDashboard() {
  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [selectedModule, setSelectedModule] = useState<Module | null>(null)
  const [students, setStudents] = useState<Profile[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [materialsMap, setMaterialsMap] = useState<Record<string, LessonMaterial[]>>({})
  const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, boolean>>>({})
  const [homeworkMap, setHomeworkMap] = useState<Record<string, Homework[]>>({})
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showCreateModule, setShowCreateModule] = useState(false)
  const [showCreateLesson, setShowCreateLesson] = useState(false)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newModuleName, setNewModuleName] = useState('')
  const [newLessonTopic, setNewLessonTopic] = useState('')
  const [newLessonDate, setNewLessonDate] = useState(new Date().toISOString().split('T')[0])
  const [newLessonNumber, setNewLessonNumber] = useState(1)
  const [newStudentName, setNewStudentName] = useState('')
  const [newMaterials, setNewMaterials] = useState<{title: string; file: File | null; url: string}[]>([])
  const [activeTab, setActiveTab] = useState<'students' | 'journal' | 'homework'>('students')
  const [hwModuleLessons, setHwModuleLessons] = useState<Record<string, Lesson[]>>({})
  const navigate = useNavigate()

  useEffect(() => {
    const role = localStorage.getItem('user_role')
    if (role !== 'teacher') {
      navigate('/')
      return
    }
    loadGroups()
  }, [])

  useEffect(() => {
    if (selectedGroup) {
      loadGroupData(selectedGroup.id)
    }
  }, [selectedGroup])

  useEffect(() => {
    if (selectedModule) {
      loadModuleLessons(selectedModule.id)
    }
  }, [selectedModule])

  useEffect(() => {
    if (selectedGroup && activeTab === 'homework') {
      loadHomeworkData(selectedGroup.id)
    }
  }, [selectedGroup, activeTab])

  const loadGroups = async () => {
    const role = localStorage.getItem('user_role')
    if (role !== 'teacher') {
      navigate('/')
      return
    }

    const teacherId = localStorage.getItem('teacher_id')
    const loginCode = localStorage.getItem('login_code')

    if (!teacherId && !loginCode) {
      navigate('/')
      return
    }

    let profileId: string | null = teacherId

    if (!profileId && loginCode) {
      const { data: codeProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('login_code', loginCode)
        .eq('role', 'teacher')
        .maybeSingle()

      if (codeProfile) {
        profileId = codeProfile.id
        localStorage.setItem('teacher_id', codeProfile.id)
      }
    }

    if (!profileId) {
      navigate('/')
      return
    }

    const { data } = await supabase
      .from('groups')
      .select('*')
      .eq('teacher_id', profileId)

    if (data) setGroups(data)
  }

  const loadGroupData = async (groupId: string) => {
    const { data: studentsData } = await supabase
      .from('profiles')
      .select('*')
      .eq('group_id', groupId)
      .eq('role', 'student')

    if (studentsData) setStudents(studentsData)

    const { data: modulesData } = await supabase
      .from('modules')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order')

    if (modulesData) setModules(modulesData)
  }

  const loadModuleLessons = async (moduleId: string) => {
    const { data: lessonsData } = await supabase
      .from('lessons')
      .select('*')
      .eq('module_id', moduleId)
      .order('lesson_number')

    if (lessonsData) {
      setLessons(lessonsData)
      await loadMaterialsAndHomework(lessonsData.map(l => l.id))
    } else {
      setLessons([])
    }
  }

  const loadHomeworkData = async (groupId: string) => {
    const { data: modulesData } = await supabase
      .from('modules')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order')

    if (!modulesData || modulesData.length === 0) {
      setHwModuleLessons({})
      return
    }

    const moduleIds = modulesData.map(m => m.id)

    const { data: lessonsData } = await supabase
      .from('lessons')
      .select('*')
      .in('module_id', moduleIds)
      .order('lesson_number')

    if (!lessonsData) {
      setHwModuleLessons({})
      return
    }

    const lessonIds = lessonsData.map(l => l.id)

    const { data: hwData } = await supabase
      .from('homework')
      .select('*')
      .in('lesson_id', lessonIds)

    if (hwData) {
      const hwMap: Record<string, Homework[]> = {}
      hwData.forEach((h: Homework) => {
        if (!hwMap[h.lesson_id]) hwMap[h.lesson_id] = []
        hwMap[h.lesson_id].push(h)
      })
      setHomeworkMap(hwMap)
    }

    const { data: attData } = await supabase
      .from('attendance')
      .select('*')
      .in('lesson_id', lessonIds)

    if (attData) {
      const map: Record<string, Record<string, boolean>> = {}
      attData.forEach((a: Attendance) => {
        if (!map[a.lesson_id]) map[a.lesson_id] = {}
        map[a.lesson_id][a.student_id] = a.present
      })
      setAttendanceMap(map)
    }

    const lessonMap: Record<string, Lesson[]> = {}
    modulesData.forEach(m => {
      lessonMap[m.id] = lessonsData.filter(l => l.module_id === m.id)
    })
    setHwModuleLessons(lessonMap)

    await loadMaterialsAndHomework(lessonIds)
  }

  const loadMaterialsAndHomework = async (lessonIds: string[]) => {
    if (lessonIds.length === 0) {
      setMaterialsMap({})
      return
    }

    const { data: materialsData } = await supabase
      .from('lesson_materials')
      .select('*')
      .in('lesson_id', lessonIds)
      .order('sort_order')

    if (materialsData) {
      const matMap: Record<string, LessonMaterial[]> = {}
      materialsData.forEach((m: LessonMaterial) => {
        if (!matMap[m.lesson_id]) matMap[m.lesson_id] = []
        matMap[m.lesson_id].push(m)
      })
      setMaterialsMap(matMap)
    }

    const { data: attData } = await supabase
      .from('attendance')
      .select('*')
      .in('lesson_id', lessonIds)

    if (attData) {
      const map: Record<string, Record<string, boolean>> = {}
      attData.forEach((a: Attendance) => {
        if (!map[a.lesson_id]) map[a.lesson_id] = {}
        map[a.lesson_id][a.student_id] = a.present
      })
      setAttendanceMap(map)
    }

    const { data: hwData } = await supabase
      .from('homework')
      .select('*')
      .in('lesson_id', lessonIds)

    if (hwData) {
      const hwMap: Record<string, Homework[]> = {}
      hwData.forEach((h: Homework) => {
        if (!hwMap[h.lesson_id]) hwMap[h.lesson_id] = []
        hwMap[h.lesson_id].push(h)
      })
      setHomeworkMap(hwMap)
    }
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const inviteCode = `GRP${Date.now().toString(36).toUpperCase().slice(-6)}`

    const { error } = await supabase.from('groups').insert({
      name: newGroupName,
      invite_code: inviteCode,
      teacher_id: user.user.id,
    })

    if (!error) {
      setNewGroupName('')
      setShowCreateGroup(false)
      loadGroups()
    }
  }

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroup) return

    const { error } = await supabase.from('modules').insert({
      group_id: selectedGroup.id,
      name: newModuleName,
      sort_order: modules.length,
    })

    if (!error) {
      setNewModuleName('')
      setShowCreateModule(false)
      loadGroupData(selectedGroup.id)
    }
  }

  const uploadMaterialFile = async (file: File, lessonId: string, index: number): Promise<string | null> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${lessonId}/${Date.now()}-${index}.${fileExt}`

    const { error } = await supabase.storage
      .from('lesson-materials')
      .upload(fileName, file)

    if (error) {
      console.error('Upload error:', error)
      return null
    }

    const { data } = supabase.storage
      .from('lesson-materials')
      .getPublicUrl(fileName)

    return data.publicUrl
  }

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedModule) return

    const { data: lesson, error } = await supabase.from('lessons').insert({
      group_id: selectedGroup!.id,
      module_id: selectedModule.id,
      date: newLessonDate,
      topic: newLessonTopic,
      lesson_number: newLessonNumber,
    }).select().single()

    if (!error && lesson) {
      for (let i = 0; i < newMaterials.length; i++) {
        const mat = newMaterials[i]
        if (!mat.title) continue

        let url = mat.url
        if (mat.file) {
          const uploadedUrl = await uploadMaterialFile(mat.file, lesson.id, i)
          if (uploadedUrl) url = uploadedUrl
        }

        if (url) {
          const { error: matError } = await supabase.from('lesson_materials').insert({
            lesson_id: lesson.id,
            title: mat.title,
            url: url,
            sort_order: i,
          })
          if (matError) {
            console.error('Material insert error:', matError)
          }
        }
      }
      setNewLessonTopic('')
      setNewMaterials([])
      setShowCreateLesson(false)
      loadModuleLessons(selectedModule.id)
    }
  }

  const handleEditLesson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLesson) return

    const { error } = await supabase
      .from('lessons')
      .update({
        topic: newLessonTopic,
        date: newLessonDate,
        lesson_number: newLessonNumber,
      })
      .eq('id', editingLesson.id)

    if (!error) {
      setEditingLesson(null)
      setNewLessonTopic('')
      if (selectedModule) loadModuleLessons(selectedModule.id)
    }
  }

  const startEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson)
    setNewLessonTopic(lesson.topic)
    setNewLessonDate(lesson.date)
    setNewLessonNumber(lesson.lesson_number)
    setShowCreateLesson(false)
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Удалить группу со всеми модулями и уроками?')) return
    await supabase.from('groups').delete().eq('id', groupId)
    setSelectedGroup(null)
    setSelectedModule(null)
    loadGroups()
  }

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Удалить модуль со всеми уроками?')) return
    await supabase.from('modules').delete().eq('id', moduleId)
    setSelectedModule(null)
    if (selectedGroup) loadGroupData(selectedGroup.id)
  }

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm('Удалить занятие?')) return
    await supabase.from('lessons').delete().eq('id', lessonId)
    if (selectedModule) loadModuleLessons(selectedModule.id)
  }

  const handleDeleteMaterial = async (materialId: string) => {
    await supabase.from('lesson_materials').delete().eq('id', materialId)
    if (selectedModule) loadModuleLessons(selectedModule.id)
  }

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    let code = 'STU-'
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
  }

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroup || !newStudentName.trim()) return

    const inviteCode = generateInviteCode()

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: crypto.randomUUID(),
        name: newStudentName.trim(),
        full_name: newStudentName.trim(),
        role: 'student',
        group_id: selectedGroup.id,
        invite_code: inviteCode,
      })

    if (error) {
      alert('Ошибка: ' + error.message)
      return
    }

    alert(`Ученик добавлен!\n\nИмя: ${newStudentName}\nКод входа: ${inviteCode}\n\nПередайте код ученику.`)
    setNewStudentName('')
    setShowAddStudent(false)
    loadGroupData(selectedGroup.id)
  }

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('Удалить ученика?')) return
    await supabase.from('profiles').delete().eq('id', studentId)
    if (selectedGroup) loadGroupData(selectedGroup.id)
  }

  const handleToggleAttendance = async (lessonId: string, studentId: string, currentPresent: boolean) => {
    const newPresent = !currentPresent
    const { error } = await supabase
      .from('attendance')
      .upsert({
        lesson_id: lessonId,
        student_id: studentId,
        present: newPresent,
      }, { onConflict: 'lesson_id,student_id' })

    if (!error) {
      setAttendanceMap(prev => ({
        ...prev,
        [lessonId]: {
          ...prev[lessonId],
          [studentId]: newPresent,
        }
      }))
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.clear()
    navigate('/')
  }

  const addMaterial = () => {
    setNewMaterials([...newMaterials, { title: '', file: null, url: '' }])
  }

  const updateMaterialTitle = (index: number, value: string) => {
    const updated = [...newMaterials]
    updated[index].title = value
    setNewMaterials(updated)
  }

  const updateMaterialFile = (index: number, file: File | null) => {
    const updated = [...newMaterials]
    updated[index].file = file
    if (file) {
      updated[index].url = ''
    }
    setNewMaterials(updated)
  }

  const updateMaterialUrl = (index: number, value: string) => {
    const updated = [...newMaterials]
    updated[index].url = value
    if (value) {
      updated[index].file = null
    }
    setNewMaterials(updated)
  }

  const removeMaterial = (index: number) => {
    setNewMaterials(newMaterials.filter((_, i) => i !== index))
  }

  const getFileIcon = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase() || ''
    if (['html', 'htm'].includes(ext)) return 'web'
    if (['pdf'].includes(ext)) return 'pdf'
    if (['doc', 'docx'].includes(ext)) return 'doc'
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'img'
    if (['mp4', 'avi', 'mov'].includes(ext)) return 'vid'
    if (['zip', 'rar', '7z'].includes(ext)) return 'zip'
    if (['cs'].includes(ext)) return 'code'
    return 'file'
  }

  // === VIEW: Selected Module ===
  if (selectedModule && selectedGroup) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <button onClick={() => { setSelectedModule(null); setLessons([]); setEditingLesson(null); }} className="btn btn-back">
              &larr; Назад к модулям
            </button>
            <h1>{selectedModule.name}</h1>
            <p className="invite-code-inline">Группа: {selectedGroup.name}</p>
          </div>
          <button onClick={handleLogout} className="btn btn-outline">
            Выйти
          </button>
        </header>

        <div className="section-header">
          <h2>Уроки модуля</h2>
          <button onClick={() => { setShowCreateLesson(true); setEditingLesson(null); setNewLessonTopic(''); }} className="btn btn-primary btn-sm">
            + Добавить урок
          </button>
        </div>

        {(showCreateLesson || editingLesson) && (
          <form onSubmit={editingLesson ? handleEditLesson : handleCreateLesson} className="create-form">
            <input
              type="text"
              value={newLessonTopic}
              onChange={(e) => setNewLessonTopic(e.target.value)}
              placeholder="Тема урока"
              className="input"
              required
            />
            <div className="form-row">
              <input
                type="date"
                value={newLessonDate}
                onChange={(e) => setNewLessonDate(e.target.value)}
                className="input"
                required
              />
              <select
                value={newLessonNumber}
                onChange={(e) => setNewLessonNumber(Number(e.target.value))}
                className="input"
              >
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <option key={n} value={n}>Урок {n}</option>
                ))}
              </select>
            </div>

            {!editingLesson && (
              <div className="materials-section">
                <div className="materials-header">
                  <span>Файлы урока</span>
                  <button type="button" onClick={addMaterial} className="btn btn-outline btn-sm">
                    + Добавить файл
                  </button>
                </div>
                {newMaterials.map((mat, i) => (
                  <div key={i} className="material-row">
                    <input
                      type="text"
                      value={mat.title}
                      onChange={(e) => updateMaterialTitle(i, e.target.value)}
                      placeholder="Название файла"
                      className="input"
                    />
                    <label className="btn btn-outline btn-sm material-upload-btn">
                      {mat.file ? mat.file.name : 'Выбрать файл'}
                      <input
                        type="file"
                        style={{ display: 'none' }}
                        onChange={(e) => updateMaterialFile(i, e.target.files?.[0] || null)}
                      />
                    </label>
                    <span className="material-or">или</span>
                    <input
                      type="text"
                      value={mat.url}
                      onChange={(e) => updateMaterialUrl(i, e.target.value)}
                      placeholder="URL"
                      className="input"
                    />
                    <button type="button" onClick={() => removeMaterial(i)} className="btn btn-danger btn-xs">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 2l8 8M10 2l-8 8"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-sm">
                {editingLesson ? 'Сохранить' : 'Создать'}
              </button>
              <button type="button" onClick={() => { setShowCreateLesson(false); setEditingLesson(null); setNewMaterials([]); setNewLessonTopic(''); }} className="btn btn-outline btn-sm">
                Отмена
              </button>
            </div>
          </form>
        )}

        {lessons.length === 0 ? (
          <div className="empty-state">
            <p>Уроков в модуле пока нет.</p>
          </div>
        ) : (
          <div className="lessons-list">
            {lessons.map(lesson => {
              const mats = materialsMap[lesson.id] || []
              const attMap = attendanceMap[lesson.id] || {}
              const attCount = Object.values(attMap).filter(Boolean).length
              const hwCount = (homeworkMap[lesson.id] || []).length
              const isEditing = editingLesson?.id === lesson.id
              return (
                <div key={lesson.id} className={`lesson-item ${isEditing ? 'lesson-editing' : ''}`}>
                  <div className="lesson-item-header">
                    <span className="lesson-number">{lesson.lesson_number}</span>
                    <span className="lesson-date">{new Date(lesson.date).toLocaleDateString('ru-RU')}</span>
                    <span className="lesson-topic-text">{lesson.topic}</span>
                    <span className="lesson-stats">
                      {attCount}/{students.length} посещ.
                      {hwCount > 0 && ` | ${hwCount} ДЗ`}
                    </span>
                    <button
                      onClick={() => startEditLesson(lesson)}
                      className="btn btn-outline btn-xs"
                      title="Редактировать"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8.5 1.5l2 2M1 11l.5-2.5L9 1l2 2L3.5 10.5 1 11z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteLesson(lesson.id)}
                      className="btn btn-danger btn-xs"
                      title="Удалить"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 2l8 8M10 2l-8 8"/>
                      </svg>
                    </button>
                  </div>

                  {mats.length > 0 && (
                    <div className="lesson-materials">
                      {mats.map(m => (
                        <div key={m.id} className="material-tag">
                          <span className="material-icon">{getFileIcon(m.url)}</span>
                          <a href={m.url} target="_blank" rel="noopener noreferrer">{m.title}</a>
                          <button onClick={() => handleDeleteMaterial(m.id)} className="material-remove">
                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M2 2l8 8M10 2l-8 8"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="lesson-attendance">
                    <span className="lesson-attendance-title">Посещаемость:</span>
                    <div className="attendance-students">
                      {students.map(s => {
                        const present = attMap[s.id] === true
                        return (
                          <button
                            key={s.id}
                            className={`attendance-chip ${present ? 'present' : 'absent'}`}
                            onClick={() => handleToggleAttendance(lesson.id, s.id, present)}
                            title={`${s.name} — ${present ? 'Присутствовал' : 'Отсутствовал'}`}
                          >
                            <span className="attendance-avatar">{s.name.charAt(0).toUpperCase()}</span>
                            <span className="attendance-name">{s.name.split(' ')[0]}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // === VIEW: Selected Group ===
  if (selectedGroup) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <button onClick={() => { setSelectedGroup(null); setSelectedModule(null); }} className="btn btn-back">
              &larr; Назад к группам
            </button>
            <h1>{selectedGroup.name}</h1>
            <div className="invite-code-inline">
              Код: <code>{selectedGroup.invite_code}</code>
              <button
                className="btn-copy"
                onClick={() => navigator.clipboard.writeText(selectedGroup.invite_code)}
              >
                Копировать
              </button>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-outline">
            Выйти
          </button>
        </header>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'students' ? 'active' : ''}`}
            onClick={() => setActiveTab('students')}
          >
            Ученики ({students.length})
          </button>
          <button
            className={`tab ${activeTab === 'journal' ? 'active' : ''}`}
            onClick={() => setActiveTab('journal')}
          >
            Модули и уроки
          </button>
          <button
            className={`tab ${activeTab === 'homework' ? 'active' : ''}`}
            onClick={() => setActiveTab('homework')}
          >
            Домашние задания
          </button>
        </div>

        {activeTab === 'students' && (
          <div className="teacher-section">
            <div className="section-header">
              <h2>Ученики</h2>
              <button onClick={() => setShowAddStudent(!showAddStudent)} className="btn btn-primary btn-sm">
                + Добавить ученика
              </button>
            </div>

            {showAddStudent && (
              <form onSubmit={handleAddStudent} className="create-form">
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="Имя ученика"
                  className="input"
                  required
                />
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary">Добавить</button>
                  <button type="button" onClick={() => setShowAddStudent(false)} className="btn btn-ghost">Отмена</button>
                </div>
              </form>
            )}

            {students.length === 0 ? (
              <p className="empty-text">Пока нет учеников.</p>
            ) : (
              <div className="students-list">
                {students.map(s => (
                  <div key={s.id} className="student-item">
                    <span className="student-avatar">{s.name.charAt(0).toUpperCase()}</span>
                    <div className="student-info">
                      <span className="student-name">{s.name}</span>
                      {s.invite_code && (
                        <span className="student-code">Код: <code>{s.invite_code}</code></span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteStudent(s.id)}
                      className="btn btn-danger btn-xs"
                      title="Удалить"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M2 2l8 8M10 2l-8 8"/>
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'journal' && (
          <div className="teacher-section">
            <div className="section-header">
              <h2>Модули курса</h2>
              <button onClick={() => setShowCreateModule(true)} className="btn btn-primary btn-sm">
                + Создать модуль
              </button>
            </div>

            {showCreateModule && (
              <form onSubmit={handleCreateModule} className="create-form">
                <input
                  type="text"
                  value={newModuleName}
                  onChange={(e) => setNewModuleName(e.target.value)}
                  placeholder="Название модуля (например: Модуль 1 - Основы C#)"
                  className="input"
                  required
                />
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary btn-sm">Создать</button>
                  <button type="button" onClick={() => setShowCreateModule(false)} className="btn btn-outline btn-sm">
                    Отмена
                  </button>
                </div>
              </form>
            )}

            {modules.length === 0 ? (
              <div className="empty-state">
                <p>Модулей пока нет. Создайте первый модуль курса.</p>
              </div>
            ) : (
              <div className="modules-list">
                {modules.map(module => (
                  <div key={module.id} className="module-card">
                    <div className="module-card-header">
                      <h3>{module.name}</h3>
                      <button
                        onClick={() => handleDeleteModule(module.id)}
                        className="btn btn-danger btn-xs"
                        title="Удалить модуль"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M2 2l8 8M10 2l-8 8"/>
                        </svg>
                      </button>
                    </div>
                    <button
                      onClick={() => setSelectedModule(module)}
                      className="btn btn-primary btn-sm"
                    >
                      Открыть уроки
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'homework' && (
          <div className="teacher-section">
            <h2>Домашние задания</h2>
            {modules.length === 0 ? (
              <p className="empty-text">Сначала создайте модули и уроки.</p>
            ) : (
              <div className="homework-list">
                {modules.map(module => {
                  const moduleLessons = hwModuleLessons[module.id] || []
                  if (moduleLessons.length === 0) return null
                  return (
                    <div key={module.id} className="homework-module">
                      <h3 className="homework-module-title">{module.name}</h3>
                      {moduleLessons.map(lesson => {
                        const hw = homeworkMap[lesson.id] || []
                        const att = attendanceMap[lesson.id] || {}
                        return (
                          <div key={lesson.id} className="homework-lesson">
                            <div className="homework-lesson-header">
                              <span className="homework-lesson-num">Урок {lesson.lesson_number}</span>
                              <span className="homework-lesson-topic">{lesson.topic}</span>
                              <span className="homework-lesson-date">{new Date(lesson.date).toLocaleDateString('ru-RU')}</span>
                            </div>
                            {hw.length === 0 && students.length > 0 ? (
                              <p className="homework-empty">Нет сданных работ</p>
                            ) : (
                              <div className="homework-students">
                                {students.map(s => {
                                  const hwItem = hw.find(h => h.student_id === s.id)
                                  const isPresent = att[s.id] === true
                                  return (
                                    <div key={s.id} className={`homework-student ${hwItem ? 'submitted' : ''}`}>
                                      <span className="homework-student-avatar">{s.name.charAt(0).toUpperCase()}</span>
                                      <span className="homework-student-name">{s.name}</span>
                                      <span className={`homework-status ${isPresent ? 'green' : 'gray'}`}>
                                        {isPresent ? 'На уроке' : 'Не был'}
                                      </span>
                                      {hwItem ? (
                                        <div className="homework-submitted">
                                          <span className="hw-check">
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M2 7l3.5 3.5L12 3"/>
                                            </svg>
                                          </span>
                                          <a href={hwItem.file_url || '#'} target="_blank" rel="noopener noreferrer" className="homework-file-link">
                                            {hwItem.file_name || 'Файл'}
                                          </a>
                                          <span className="homework-date">
                                            {new Date(hwItem.submitted_at).toLocaleDateString('ru-RU')}
                                          </span>
                                        </div>
                                      ) : (
                                        <span className="hw-missing">Не сдано</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
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

  // === VIEW: Groups List ===
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>Панель преподавателя</h1>
          <p>Управление группами и курсами</p>
        </div>
        <button onClick={handleLogout} className="btn btn-outline">
          Выйти
        </button>
      </header>

      <div className="section-header">
        <h2>Мои группы</h2>
        <button onClick={() => setShowCreateGroup(true)} className="btn btn-primary">
          + Создать группу
        </button>
      </div>

      {showCreateGroup && (
        <form onSubmit={handleCreateGroup} className="create-form">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Название группы (например, Группа 1)"
            className="input"
            required
          />
          <div className="form-actions">
            <button type="submit" className="btn btn-primary btn-sm">Создать</button>
            <button type="button" onClick={() => setShowCreateGroup(false)} className="btn btn-outline btn-sm">
              Отмена
            </button>
          </div>
        </form>
      )}

      {groups.length === 0 ? (
        <div className="empty-state">
          <p>Групп пока нет. Создайте первую группу.</p>
        </div>
      ) : (
        <div className="groups-grid">
          {groups.map(group => (
            <div key={group.id} className="group-card">
              <div className="group-card-header">
                <h3>{group.name}</h3>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="btn btn-danger btn-xs"
                  title="Удалить группу"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 2l8 8M10 2l-8 8"/>
                  </svg>
                </button>
              </div>
              <div className="group-code">
                Код: <strong>{group.invite_code}</strong>
              </div>
              <button
                onClick={() => setSelectedGroup(group)}
                className="btn btn-primary btn-sm"
              >
                Открыть
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
