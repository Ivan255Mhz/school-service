import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Lesson, Attendance, Homework, LessonMaterial, Module, StudentNote } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export function StudentDashboard() {
  const [modules, setModules] = useState<Module[]>([])
  const [selectedModule, setSelectedModule] = useState<Module | null>(null)
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [homework, setHomework] = useState<Homework[]>([])
  const [materialsMap, setMaterialsMap] = useState<Record<string, LessonMaterial[]>>({})
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmingAttendance, setConfirmingAttendance] = useState<string | null>(null)
  const [allLessons, setAllLessons] = useState<Lesson[]>([])
  const [moduleLessonsMap, setModuleLessonsMap] = useState<Record<string, Lesson[]>>({})
  const [notesMap, setNotesMap] = useState<Record<string, StudentNote>>({})
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const navigate = useNavigate()

  const groupId = localStorage.getItem('group_id')
  const groupName = localStorage.getItem('group_name')
  const studentName = localStorage.getItem('student_name')
  const studentId = localStorage.getItem('student_id')

  const loadData = useCallback(async () => {
    if (!groupId) {
      navigate('/')
      return
    }

    const { data: modulesData } = await supabase
      .from('modules')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order')

    if (modulesData) {
      setModules(modulesData)
      await loadAllModuleLessons(modulesData)
    }

    if (studentId) {
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', studentId)

      if (attendanceData) setAttendance(attendanceData)

      const { data: homeworkData } = await supabase
        .from('homework')
        .select('*')
        .eq('student_id', studentId)

      if (homeworkData) setHomework(homeworkData)

      const { data: notesData } = await supabase
        .from('student_notes')
        .select('*')
        .eq('student_id', studentId)

      if (notesData) {
        const nMap: Record<string, StudentNote> = {}
        notesData.forEach((n: StudentNote) => { nMap[n.lesson_id] = n })
        setNotesMap(nMap)
      }
    }
  }, [groupId, studentId, navigate])

  useEffect(() => {
    const role = localStorage.getItem('user_role')
    if (role !== 'student') {
      navigate('/')
      return
    }
    loadData()
  }, [loadData])

  const loadAllModuleLessons = async (modulesData: Module[]) => {
    if (modulesData.length === 0) return

    const allLess: Lesson[] = []
    const moduleMap: Record<string, Lesson[]> = {}

    for (const mod of modulesData) {
      const { data: lessonsData } = await supabase
        .from('lessons')
        .select('*')
        .eq('module_id', mod.id)
        .eq('is_completed', true)
        .order('lesson_number')

      if (lessonsData) {
        moduleMap[mod.id] = lessonsData
        allLess.push(...lessonsData)
      }
    }

    setModuleLessonsMap(moduleMap)
    setAllLessons(allLess)

    if (allLess.length > 0) {
      await loadMaterials(allLess.map(l => l.id))
    }
  }

  const loadMaterials = async (lessonIds: string[]) => {
    if (lessonIds.length === 0) return

    const { data } = await supabase
      .from('lesson_materials')
      .select('*')
      .in('lesson_id', lessonIds)
      .order('sort_order')

    if (data) {
      const matMap: Record<string, LessonMaterial[]> = {}
      data.forEach((m: LessonMaterial) => {
        if (!matMap[m.lesson_id]) matMap[m.lesson_id] = []
        matMap[m.lesson_id].push(m)
      })
      setMaterialsMap(prev => ({ ...prev, ...matMap }))
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.clear()
    navigate('/')
  }

  const handleConfirmAttendance = async (lessonId: string) => {
    setConfirmingAttendance(lessonId)
    if (!studentId) return

    const { error } = await supabase
      .from('attendance')
      .upsert({
        lesson_id: lessonId,
        student_id: studentId,
        present: true,
      }, { onConflict: 'lesson_id,student_id' })

    if (!error) {
      loadData()
    }
    setConfirmingAttendance(null)
  }

  const handleFileUpload = async (lessonId: string, file: File) => {
    setUploading(true)
    if (!studentId) return

    const fileExt = file.name.split('.').pop()
    const fileName = `${studentId}/${lessonId}.${fileExt}`

    const { error: uploadError } = await supabase.storage
      .from('homework')
      .upload(fileName, file)

    if (uploadError) {
      console.error('Upload error:', uploadError)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('homework')
      .getPublicUrl(fileName)

    await supabase.from('homework').upsert({
      student_id: studentId,
      lesson_id: lessonId,
      file_url: urlData.publicUrl,
      file_name: file.name,
    })

    setUploading(false)
    loadData()
  }

  const handleSaveNote = async (lessonId: string) => {
    if (!studentId) return

    const existing = notesMap[lessonId]
    if (existing) {
      const { error } = await supabase
        .from('student_notes')
        .update({ content: noteText, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (!error) {
        setNotesMap(prev => ({
          ...prev,
          [lessonId]: { ...prev[lessonId], content: noteText }
        }))
        setEditingNote(null)
      }
    } else {
      const { data, error } = await supabase
        .from('student_notes')
        .insert({
          student_id: studentId,
          lesson_id: lessonId,
          content: noteText,
        })
        .select()
        .single()

      if (!error && data) {
        setNotesMap(prev => ({ ...prev, [lessonId]: data }))
        setEditingNote(null)
      }
    }
  }

  const handleStartEditNote = (lessonId: string) => {
    const existing = notesMap[lessonId]
    setNoteText(existing?.content || '')
    setEditingNote(lessonId)
  }

  const getAttendanceStatus = (lessonId: string) => {
    return attendance.find(a => a.lesson_id === lessonId)
  }

  const getHomeworkStatus = (lessonId: string) => {
    return homework.find(h => h.lesson_id === lessonId)
  }

  const getModuleProgress = (moduleId: string) => {
    const modLessons = moduleLessonsMap[moduleId] || []
    if (modLessons.length === 0) return { total: 0, attended: 0, submitted: 0, percent: 0 }

    const attended = modLessons.filter(l => getAttendanceStatus(l.id)).length
    const submitted = modLessons.filter(l => getHomeworkStatus(l.id)).length
    const percent = Math.round((attended / modLessons.length) * 100)

    return { total: modLessons.length, attended, submitted, percent }
  }

  const getGlobalStats = () => {
    const total = allLessons.length
    const attended = allLessons.filter(l => getAttendanceStatus(l.id)).length
    const submitted = allLessons.filter(l => getHomeworkStatus(l.id)).length
    const attendancePercent = total > 0 ? Math.round((attended / total) * 100) : 0

    return { total, attended, submitted, attendancePercent }
  }

  const getFileType = (url: string) => {
    const ext = url.split('.').pop()?.toLowerCase() || ''
    if (['html', 'htm'].includes(ext)) return 'html'
    if (['pdf'].includes(ext)) return 'pdf'
    if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(ext)) return 'image'
    if (['mp4', 'avi', 'mov', 'webm'].includes(ext)) return 'video'
    if (['cs'].includes(ext)) return 'code'
    if (['doc', 'docx'].includes(ext)) return 'doc'
    if (['zip', 'rar', '7z'].includes(ext)) return 'archive'
    return 'file'
  }

  const getCurrentModuleLessons = () => {
    if (!selectedModule) return []
    return moduleLessonsMap[selectedModule.id] || []
  }

  const getAdjacentLessons = () => {
    if (!selectedLesson) return { prev: null, next: null }
    const currentModuleLessons = getCurrentModuleLessons()
    const idx = currentModuleLessons.findIndex(l => l.id === selectedLesson.id)
    return {
      prev: idx > 0 ? currentModuleLessons[idx - 1] : null,
      next: idx < currentModuleLessons.length - 1 ? currentModuleLessons[idx + 1] : null,
    }
  }

  // === VIEW: Selected Lesson ===
  if (selectedLesson) {
    const hasAttendance = getAttendanceStatus(selectedLesson.id)
    const hw = getHomeworkStatus(selectedLesson.id)
    const mats = materialsMap[selectedLesson.id] || []
    const note = notesMap[selectedLesson.id]
    const { prev, next } = getAdjacentLessons()
    const isEditingNote = editingNote === selectedLesson.id

    return (
      <div className="lesson-view">
        <div className="lesson-view-top">
          <button onClick={() => setSelectedLesson(null)} className="btn btn-back">
            &larr; Назад к урокам
          </button>
        </div>

        <div className="lesson-title-section">
          <span className="lesson-number-big">{selectedLesson.lesson_number}</span>
          <div className="lesson-title-info">
            <h1>{selectedLesson.topic}</h1>
            <span className="lesson-date-full">{new Date(selectedLesson.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        <div className="lesson-status-row">
          <div className={`lesson-status-chip ${hasAttendance ? 'done' : 'pending'}`}>
            <span className="status-icon">{hasAttendance ? '✓' : '○'}</span>
            <span>Посещение</span>
          </div>
          <div className={`lesson-status-chip ${hw ? 'done' : 'pending'}`}>
            <span className="status-icon">{hw ? '✓' : '○'}</span>
            <span>Домашнее задание</span>
          </div>
          {mats.length > 0 && (
            <div className="lesson-status-chip info">
              <span className="status-icon">{mats.length}</span>
              <span>файл(ов)</span>
            </div>
          )}
        </div>

        <div className="lesson-body">
          <div className="lesson-main-col">
            {selectedLesson.homework_description && (
              <div className="lesson-section">
                <h2 className="section-title">Домашнее задание</h2>
                <div className="homework-card">
                  <p>{selectedLesson.homework_description}</p>
                </div>
              </div>
            )}

            <div className="lesson-section">
              <h2 className="section-title">Материалы урока</h2>
              {mats.length === 0 ? (
                <div className="empty-state-inline">
                  <p>Файлы пока не добавлены</p>
                </div>
              ) : (
                <div className="materials-grid">
                  {mats.map(m => (
                    <a
                      key={m.id}
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="material-card"
                    >
                      <div className="material-card-icon">{getFileType(m.url)}</div>
                      <div className="material-card-info">
                        <span className="material-card-name">{m.title}</span>
                      </div>
                      <span className="material-card-arrow">&rarr;</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div className="lesson-section">
              <div className="section-title-row">
                <h2 className="section-title">Мои заметки</h2>
                {!isEditingNote && (
                  <button
                    onClick={() => handleStartEditNote(selectedLesson.id)}
                    className="btn btn-ghost btn-sm"
                  >
                    {note ? 'Редактировать' : '+ Добавить'}
                  </button>
                )}
              </div>
              {isEditingNote ? (
                <div className="note-editor">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Запишите важное..."
                    className="note-textarea"
                    rows={4}
                  />
                  <div className="note-actions">
                    <button onClick={() => handleSaveNote(selectedLesson.id)} className="btn btn-primary btn-sm">
                      Сохранить
                    </button>
                    <button onClick={() => setEditingNote(null)} className="btn btn-ghost btn-sm">
                      Отмена
                    </button>
                  </div>
                </div>
              ) : note ? (
                <div className="note-display">
                  <p>{note.content}</p>
                </div>
              ) : (
                <div className="empty-state-inline">
                  <p>Заметок пока нет</p>
                </div>
              )}
            </div>
          </div>

          <div className="lesson-side-col">
            <div className="lesson-action-card">
              <h3>Посещение</h3>
              {hasAttendance ? (
                <div className="action-done">
                  <span className="action-done-icon">✓</span>
                  <span>Посещение подтверждено</span>
                </div>
              ) : (
                <>
                  <p className="action-hint">Подтвердите, что вы были на уроке</p>
                  <button
                    onClick={() => handleConfirmAttendance(selectedLesson.id)}
                    className="btn btn-primary btn-full"
                    disabled={confirmingAttendance === selectedLesson.id}
                  >
                    {confirmingAttendance === selectedLesson.id ? 'Отмечаем...' : 'Я был на уроке'}
                  </button>
                </>
              )}
            </div>

            <div className="lesson-action-card">
              <h3>Домашнее задание</h3>
              {!hasAttendance ? (
                <p className="action-hint">Сначала отметьте посещение</p>
              ) : hw ? (
                <>
                  <div className="uploaded-file">
                    <span className="uploaded-file-icon">✓</span>
                    <span className="uploaded-file-name">{hw.file_name}</span>
                  </div>
                  <label className="btn btn-outline btn-sm btn-full">
                    Заменить файл
                    <input
                      type="file"
                      accept=".cs,.txt,.pdf,.zip"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleFileUpload(selectedLesson.id, file)
                      }}
                      disabled={uploading}
                    />
                  </label>
                </>
              ) : (
                <label className="btn btn-outline btn-full">
                  {uploading ? 'Загрузка...' : 'Загрузить файл'}
                  <input
                    type="file"
                    accept=".cs,.txt,.pdf,.zip"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(selectedLesson.id, file)
                    }}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        <div className="lesson-nav-bottom">
          {prev ? (
            <button onClick={() => setSelectedLesson(prev)} className="btn btn-outline">
              &larr; Урок {prev.lesson_number}: {prev.topic}
            </button>
          ) : <div />}
          {next ? (
            <button onClick={() => setSelectedLesson(next)} className="btn btn-outline">
              Урок {next.lesson_number}: {next.topic} &rarr;
            </button>
          ) : <div />}
        </div>
      </div>
    )
  }

  // === VIEW: Selected Module ===
  if (selectedModule) {
    const progress = getModuleProgress(selectedModule.id)
    const currentModuleLessons = getCurrentModuleLessons()

    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <button onClick={() => { setSelectedModule(null); }} className="btn btn-back">
              &larr; Назад к модулям
            </button>
            <h1>{selectedModule.name}</h1>
          </div>
          <button onClick={handleLogout} className="btn btn-outline">
            Выйти
          </button>
        </header>

        <div className="module-progress-bar">
          <div className="progress-info">
            <span>Прогресс модуля</span>
            <span>{progress.attended}/{progress.total} уроков | {progress.submitted} ДЗ сдано</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>

        <div className="lessons-grid">
          {currentModuleLessons.length === 0 ? (
            <div className="empty-state">
              <p>Уроков в модуле пока нет.</p>
            </div>
          ) : (
            currentModuleLessons.map((lesson) => {
              const att = getAttendanceStatus(lesson.id)
              const hw = getHomeworkStatus(lesson.id)
              const mats = materialsMap[lesson.id] || []

              return (
                <div key={lesson.id} className="lesson-card">
                  <div className="lesson-card-header">
                    <span className="lesson-number">{lesson.lesson_number}</span>
                    <span className="lesson-date">{new Date(lesson.date).toLocaleDateString('ru-RU')}</span>
                  </div>
                  <h3 className="lesson-topic">{lesson.topic}</h3>

                  <div className="lesson-badges">
                    <span className={`badge ${att ? 'badge-green' : 'badge-gray'}`}>
                      {att ? 'Посещено' : 'Не посещено'}
                    </span>
                    {lesson.homework_description && (
                      <span className={`badge ${hw ? 'badge-blue' : 'badge-yellow'}`}>
                        {hw ? 'ДЗ сдано' : 'ДЗ задано'}
                      </span>
                    )}
                    {mats.length > 0 && (
                      <span className="badge badge-accent">{mats.length} файл(ов)</span>
                    )}
                  </div>

                  <button
                    onClick={() => setSelectedLesson(lesson)}
                    className="btn btn-primary btn-sm"
                  >
                    Открыть урок
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // === VIEW: Modules List ===
  const stats = getGlobalStats()

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>{groupName || 'Speak'}</h1>
          <p>{studentName}</p>
        </div>
        <button onClick={handleLogout} className="btn btn-outline">
          Выйти
        </button>
      </header>

      <div className="student-stats">
        <div className="stat-card">
          <span className="stat-value">{stats.total}</span>
          <span className="stat-label">Всего уроков</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.attended}</span>
          <span className="stat-label">Посещено</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.submitted}</span>
          <span className="stat-label">ДЗ сдано</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.attendancePercent}%</span>
          <span className="stat-label">Посещаемость</span>
        </div>
      </div>

      <div className="modules-grid">
        {modules.length === 0 ? (
          <div className="empty-state">
            <p>Модули пока не добавлены.</p>
          </div>
        ) : (
          modules.map((module) => {
            const progress = getModuleProgress(module.id)
            return (
              <div key={module.id} className="module-card">
                <div className="module-card-header">
                  <h3>{module.name}</h3>
                </div>
                <div className="module-progress">
                  <div className="module-progress-info">
                    <span>{progress.attended}/{progress.total} уроков</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div className="progress-track progress-track-sm">
                    <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedModule(module)
                  }}
                  className="btn btn-primary btn-sm"
                >
                  Открыть
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
