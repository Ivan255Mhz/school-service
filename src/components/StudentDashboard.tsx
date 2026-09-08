import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { materialHref } from '../lib/materials'
import { uploadAvatar, MAX_AVATAR_SIZE } from '../lib/avatar'
import type { Lesson, Attendance, Homework, LessonMaterial, Module, StudentNote, LibraryItem } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { showToast } from './Toast'
import { NotificationBell } from './NotificationBell'

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
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'modules' | 'library' | 'schedule'>('modules')
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])
  const [libraryLessons, setLibraryLessons] = useState<(LessonMaterial & { lesson_number: number; lesson_topic: string; lesson_date: string })[]>([])
  const [scheduleLessons, setScheduleLessons] = useState<Lesson[]>([])
  const [calWeekStart, setCalWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + 1)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [myAvatar, setMyAvatar] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
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

    try {
      const { data: modulesData, error: modErr } = await supabase
        .from('modules')
        .select('*')
        .eq('group_id', groupId)
        .order('sort_order')

      if (modErr) throw modErr
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

        const { data: profileData } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', studentId)
          .maybeSingle()

        if (profileData) setMyAvatar(profileData.avatar_url)
      }

      const { data: libItems } = await supabase
        .from('library_items')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })

      if (libItems) setLibraryItems(libItems)

      const { data: schedData } = await supabase
        .from('lessons')
        .select('*')
        .eq('group_id', groupId)
        .order('date')

      if (schedData) setScheduleLessons(schedData)

      const { data: lessonsWithMaterials } = await supabase
        .from('lesson_materials')
        .select('*, lessons(lesson_number, topic, date)')
        .in('lesson_id', (
          await supabase.from('lessons').select('id').eq('group_id', groupId)
        ).data?.map((l: { id: string }) => l.id) || [])

      if (lessonsWithMaterials) {
        const enriched = lessonsWithMaterials
          .filter((m: Record<string, unknown>) => m.lessons)
          .map((m: Record<string, unknown>) => {
            const lesson = m.lessons as { lesson_number: number; topic: string; date: string }
            return {
              ...m,
              lesson_number: lesson.lesson_number,
              lesson_topic: lesson.topic,
              lesson_date: lesson.date,
            }
          })
        setLibraryLessons(enriched as (LessonMaterial & { lesson_number: number; lesson_topic: string; lesson_date: string })[])
      }
    } catch {
      showToast('error', 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
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

  const handleMyAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !studentId) return

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Можно загружать только изображения')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      showToast('error', 'Файл слишком большой (максимум 5 МБ)')
      return
    }

    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(studentId, file)
      setMyAvatar(url)
      showToast('success', 'Фото обновлено')
    } catch {
      showToast('error', 'Не удалось загрузить фото')
    } finally {
      setUploadingAvatar(false)
    }
  }

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

    if (error) {
      showToast('error', 'Не удалось подтвердить посещение')
    } else {
      showToast('success', 'Посещение подтверждено')
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
      showToast('error', 'Ошибка загрузки файла')
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('homework')
      .getPublicUrl(fileName)

    const { error: dbError } = await supabase.from('homework').upsert({
      student_id: studentId,
      lesson_id: lessonId,
      file_url: urlData.publicUrl,
      file_name: file.name,
    })

    if (dbError) {
      showToast('error', 'Ошибка сохранения файла')
    } else {
      showToast('success', 'Файл загружен')
      notifyHomeworkSubmitted(lessonId)
      loadData()
    }
    setUploading(false)
  }

  const notifyHomeworkSubmitted = async (lessonId: string) => {
    if (!studentId) return

    const lesson = allLessons.find(l => l.id === lessonId)

    const [groupRes, adminsRes] = await Promise.all([
      supabase.from('groups').select('teacher_id').eq('id', groupId).maybeSingle(),
      supabase.from('profiles').select('id').eq('role', 'admin'),
    ])

    const recipients = new Set<string>()
    if (groupRes.data?.teacher_id) recipients.add(groupRes.data.teacher_id)
    ;(adminsRes.data || []).forEach(a => recipients.add(a.id))
    if (recipients.size === 0) return

    const title = lesson
      ? `${studentName} сдал ДЗ: Урок ${lesson.lesson_number} — ${lesson.topic}`
      : `${studentName} сдал ДЗ по уроку`

    await supabase.from('notifications').insert(
      [...recipients].map(rid => ({
        recipient_id: rid,
        type: 'homework_submitted',
        title,
        lesson_id: lessonId,
      }))
    )
  }

  const handleSaveNote = async (lessonId: string) => {
    if (!studentId) return

    const existing = notesMap[lessonId]
    if (existing) {
      const { error } = await supabase
        .from('student_notes')
        .update({ content: noteText, updated_at: new Date().toISOString() })
        .eq('id', existing.id)

      if (error) {
        showToast('error', 'Не удалось сохранить заметку')
      } else {
        setNotesMap(prev => ({
          ...prev,
          [lessonId]: { ...prev[lessonId], content: noteText }
        }))
        setEditingNote(null)
        showToast('success', 'Заметка сохранена')
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

      if (error || !data) {
        showToast('error', 'Не удалось сохранить заметку')
      } else {
        setNotesMap(prev => ({ ...prev, [lessonId]: data }))
        setEditingNote(null)
        showToast('success', 'Заметка сохранена')
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

  const openScheduleLesson = (lesson: Lesson) => {
    if (!lesson.is_completed) {
      showToast('info', 'Урок ещё не проведён — материалы появятся после занятия')
      return
    }
    const mod = modules.find(m => m.id === lesson.module_id) || null
    setSelectedModule(mod)
    setSelectedLesson(lesson)
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
        <header className="dashboard-header">
          <div className="header-left">
            <button onClick={() => setSelectedLesson(null)} className="btn btn-back">
              &larr; Назад к урокам
            </button>
            <div className="header-title">
              <h1>{selectedLesson.topic}</h1>
              <p>
                Урок {selectedLesson.lesson_number}
                {selectedLesson.date && ` · ${new Date(selectedLesson.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                {selectedModule && ` · ${selectedModule.name}`}
              </p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-outline btn-logout">
            Выйти
          </button>
        </header>

        <div className="lesson-actions-row">
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
                  href={materialHref(m.url, m.title)}
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
      <div className="dashboard view-enter">
        <header className="dashboard-header">
          <div className="header-left">
            <button onClick={() => { setSelectedModule(null); }} className="btn btn-back">
              &larr; Назад к модулям
            </button>
            <div className="header-title">
              <h1>{selectedModule.name}</h1>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-outline btn-logout">
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
                    <span className="lesson-date">{lesson.date ? new Date(lesson.date).toLocaleDateString('ru-RU') : '—'}</span>
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
  if (loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <h1>{groupName || 'Speak'}</h1>
            <p>{studentName}</p>
          </div>
        </header>
        <div className="student-stats">
          <div className="skeleton skeleton-stat" />
          <div className="skeleton skeleton-stat" />
          <div className="skeleton skeleton-stat" />
          <div className="skeleton skeleton-stat" />
        </div>
        <div className="lessons-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    )
  }

  const stats = getGlobalStats()

  return (
    <div className="dashboard view-enter">
      <header className="dashboard-header">
        <div className="header-title header-title-with-avatar">
          <label className="avatar-editable" title="Изменить фото">
            {myAvatar ? (
              <img src={myAvatar} className="avatar-img" alt="" />
            ) : (
              <span className="avatar-letter">{studentName?.charAt(0).toUpperCase() || '👤'}</span>
            )}
            <span className="avatar-edit-overlay">
              {uploadingAvatar ? '...' : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              className="avatar-input"
              onChange={handleMyAvatarChange}
              disabled={uploadingAvatar}
            />
          </label>
          <div>
            <h1>{groupName || 'Speak'}</h1>
            <p>{studentName}</p>
          </div>
        </div>
        <div className="header-actions">
          {studentId && <NotificationBell recipientId={studentId} />}
          <button onClick={handleLogout} className="btn btn-outline btn-logout">
            Выйти
          </button>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'modules' ? 'active' : ''}`}
          onClick={() => setActiveTab('modules')}
        >
          Уроки
        </button>
        <button
          className={`tab ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          Расписание
        </button>
        <button
          className={`tab ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          Библиотека
        </button>
      </div>

      {activeTab === 'modules' && (
        <>
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
        </>
      )}

      {activeTab === 'library' && (
        <div className="library-section">
          {libraryItems.length === 0 && libraryLessons.length === 0 ? (
            <div className="empty-state">
              <p>Библиотека пока пуста.</p>
            </div>
          ) : (
            <>
              {libraryItems.filter(i => i.type === 'book').length > 0 && (
                <div className="library-group">
                  <h3 className="library-group-title">Книги</h3>
                  <div className="library-list">
                    {libraryItems.filter(i => i.type === 'book').map(item => (
                      <div key={item.id} className="library-item">
                        <div className="library-item-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 19.5v-15A2.5 2.5 0 016.5 2H20v20H6.5a2.5 2.5 0 010-5H20"/>
                          </svg>
                        </div>
                        <div className="library-item-info">
                          <span className="library-item-title">{item.title}</span>
                          {item.description && <span className="library-item-desc">{item.description}</span>}
                        </div>
                        <a
                          href={materialHref(item.file_url || item.url || '#', item.title)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm"
                        >
                          Открыть
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {libraryItems.filter(i => i.type === 'article' || i.type === 'link').length > 0 && (
                <div className="library-group">
                  <h3 className="library-group-title">Статьи и ссылки</h3>
                  <div className="library-list">
                    {libraryItems.filter(i => i.type === 'article' || i.type === 'link').map(item => (
                      <div key={item.id} className="library-item">
                        <div className="library-item-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                            <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                          </svg>
                        </div>
                        <div className="library-item-info">
                          <span className="library-item-title">{item.title}</span>
                          {item.description && <span className="library-item-desc">{item.description}</span>}
                        </div>
                        <a
                          href={item.url || item.file_url || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm"
                        >
                          Открыть
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {libraryLessons.length > 0 && (
                <div className="library-group">
                  <h3 className="library-group-title">Материалы уроков</h3>
                  <div className="library-list">
                    {libraryLessons.map((mat, idx) => (
                      <div key={mat.id || idx} className="library-item">
                        <div className="library-item-icon">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                            <polyline points="14,2 14,8 20,8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                          </svg>
                        </div>
                        <div className="library-item-info">
                          <span className="library-item-title">{mat.title}</span>
                          <span className="library-item-desc">Урок {mat.lesson_number} — {mat.lesson_topic}</span>
                        </div>
                        <a
                          href={materialHref(mat.url, mat.title)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-outline btn-sm"
                        >
                          Открыть
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="teacher-section">
          <div className="calendar-header">
            <button onClick={() => {
              const d = new Date(calWeekStart)
              d.setDate(d.getDate() - 7)
              setCalWeekStart(d)
            }} className="btn btn-outline btn-sm">&larr;</button>
            <h2>
              {calWeekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
              {' — '}
              {new Date(calWeekStart.getTime() + 6 * 86400000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </h2>
            <button onClick={() => {
              const d = new Date(calWeekStart)
              d.setDate(d.getDate() + 7)
              setCalWeekStart(d)
            }} className="btn btn-outline btn-sm">&rarr;</button>
          </div>

          <div className="calendar-legend">
            <span className="legend-item"><span className="legend-dot completed" />Пройден</span>
            <span className="legend-item"><span className="legend-dot planned" />Запланирован</span>
          </div>

          <div className="calendar-grid">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((dayName, i) => {
              const dayDate = new Date(calWeekStart)
              dayDate.setDate(dayDate.getDate() + i)
              const dateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`
              const dayLessons = scheduleLessons.filter(l => l.date === dateStr)
              const today = new Date()
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
              const isToday = todayStr === dateStr

              return (
                <div key={i} className={`calendar-day ${isToday ? 'today' : ''} ${dayLessons.length > 0 ? 'has-events' : ''}`}>
                  <div className="calendar-day-header">
                    <span className="calendar-day-name">{dayName}</span>
                    <span className="calendar-day-num">{dayDate.getDate()}</span>
                  </div>
                  <div className="calendar-day-events">
                    {dayLessons.map(l => (
                      <button
                        key={l.id}
                        className={`calendar-event ${l.is_completed ? 'completed' : 'planned'}`}
                        title={`Урок ${l.lesson_number} — ${l.topic}`}
                        onClick={() => openScheduleLesson(l)}
                      >
                        <span className="calendar-event-num">{l.lesson_number}</span>
                        <span className="calendar-event-topic">{l.topic}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="calendar-footer">
            <button onClick={() => {
              const d = new Date()
              d.setDate(d.getDate() - d.getDay() + 1)
              d.setHours(0, 0, 0, 0)
              setCalWeekStart(d)
            }} className="btn btn-outline btn-sm">Сегодня</button>
          </div>
        </div>
      )}
    </div>
  )
}
