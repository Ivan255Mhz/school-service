import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Lesson, Attendance, Homework, LessonMaterial, Module } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export function StudentDashboard() {
  const [modules, setModules] = useState<Module[]>([])
  const [selectedModule, setSelectedModule] = useState<Module | null>(null)
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [homework, setHomework] = useState<Homework[]>([])
  const [materialsMap, setMaterialsMap] = useState<Record<string, LessonMaterial[]>>({})
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null)
  const [selectedMaterial, setSelectedMaterial] = useState<LessonMaterial | null>(null)
  const [uploading, setUploading] = useState(false)
  const [confirmingAttendance, setConfirmingAttendance] = useState<string | null>(null)
  const navigate = useNavigate()

  const groupId = localStorage.getItem('group_id')
  const groupName = localStorage.getItem('group_name')
  const studentName = localStorage.getItem('student_name')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    if (!groupId) {
      navigate('/')
      return
    }

    const { data: modulesData } = await supabase
      .from('modules')
      .select('*')
      .eq('group_id', groupId)
      .order('sort_order')

    if (modulesData) setModules(modulesData)

    const { data: user } = await supabase.auth.getUser()
    if (user.user) {
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', user.user.id)

      if (attendanceData) setAttendance(attendanceData)

      const { data: homeworkData } = await supabase
        .from('homework')
        .select('*')
        .eq('student_id', user.user.id)

      if (homeworkData) setHomework(homeworkData)
    }
  }

  const loadModuleLessons = async (moduleId: string) => {
    const { data: lessonsData } = await supabase
      .from('lessons')
      .select('*')
      .eq('module_id', moduleId)
      .order('lesson_number')

    if (lessonsData) {
      setLessons(lessonsData)
      await loadMaterials(lessonsData.map(l => l.id))
    } else {
      setLessons([])
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
      setMaterialsMap(matMap)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.clear()
    navigate('/')
  }

  const handleConfirmAttendance = async (lessonId: string) => {
    setConfirmingAttendance(lessonId)
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const { error } = await supabase
      .from('attendance')
      .upsert({
        lesson_id: lessonId,
        student_id: user.user.id,
        present: true,
      }, { onConflict: 'lesson_id,student_id' })

    if (!error) {
      loadData()
    }
    setConfirmingAttendance(null)
  }

  const handleFileUpload = async (lessonId: string, file: File) => {
    setUploading(true)
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.user.id}/${lessonId}.${fileExt}`

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
      student_id: user.user.id,
      lesson_id: lessonId,
      file_url: urlData.publicUrl,
      file_name: file.name,
    })

    setUploading(false)
    loadData()
  }

  const getAttendanceStatus = (lessonId: string) => {
    return attendance.find(a => a.lesson_id === lessonId)
  }

  const getHomeworkStatus = (lessonId: string) => {
    return homework.find(h => h.lesson_id === lessonId)
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

  // === VIEW: Selected Material ===
  if (selectedMaterial) {
    const fileType = getFileType(selectedMaterial.url)

    if (fileType === 'html') {
      return (
        <div className="lesson-view">
          <div className="lesson-header">
            <button onClick={() => setSelectedMaterial(null)} className="btn btn-back">
              &larr; Назад к уроку
            </button>
            <h2>{selectedMaterial.title}</h2>
          </div>
          <iframe
            src={selectedMaterial.url}
            className="lesson-iframe"
            title={selectedMaterial.title}
          />
        </div>
      )
    }

    if (fileType === 'image') {
      return (
        <div className="lesson-view">
          <div className="lesson-header">
            <button onClick={() => setSelectedMaterial(null)} className="btn btn-back">
              &larr; Назад к уроку
            </button>
            <h2>{selectedMaterial.title}</h2>
          </div>
          <div className="material-preview">
            <img src={selectedMaterial.url} alt={selectedMaterial.title} />
          </div>
        </div>
      )
    }

    if (fileType === 'video') {
      return (
        <div className="lesson-view">
          <div className="lesson-header">
            <button onClick={() => setSelectedMaterial(null)} className="btn btn-back">
              &larr; Назад к уроку
            </button>
            <h2>{selectedMaterial.title}</h2>
          </div>
          <div className="material-preview">
            <video src={selectedMaterial.url} controls />
          </div>
        </div>
      )
    }

    if (fileType === 'pdf') {
      return (
        <div className="lesson-view">
          <div className="lesson-header">
            <button onClick={() => setSelectedMaterial(null)} className="btn btn-back">
              &larr; Назад к уроку
            </button>
            <h2>{selectedMaterial.title}</h2>
          </div>
          <iframe
            src={selectedMaterial.url}
            className="lesson-iframe"
            title={selectedMaterial.title}
          />
        </div>
      )
    }

    return (
      <div className="lesson-view">
        <div className="lesson-header">
          <button onClick={() => setSelectedMaterial(null)} className="btn btn-back">
            &larr; Назад к уроку
          </button>
          <h2>{selectedMaterial.title}</h2>
        </div>
        <div className="material-download-page">
          <div className="download-card">
            <div className="download-icon">{getFileType(selectedMaterial.url).toUpperCase()}</div>
            <h3>{selectedMaterial.title}</h3>
            <a href={selectedMaterial.url} download className="btn btn-primary">
              Скачать файл
            </a>
          </div>
        </div>
      </div>
    )
  }

  // === VIEW: Selected Lesson ===
  if (selectedLesson) {
    const hasAttendance = getAttendanceStatus(selectedLesson.id)
    const hw = getHomeworkStatus(selectedLesson.id)
    const mats = materialsMap[selectedLesson.id] || []

    return (
      <div className="lesson-view">
        <div className="lesson-header">
          <button onClick={() => setSelectedLesson(null)} className="btn btn-back">
            &larr; Назад к урокам
          </button>
          <h2>Урок {selectedLesson.lesson_number}: {selectedLesson.topic}</h2>
        </div>

        <div className="lesson-content-area">
          <div className="lesson-materials-panel">
            <h3>Файлы урока</h3>
            {mats.length === 0 ? (
              <p className="empty-text">Файлы не добавлены</p>
            ) : (
              <div className="materials-list">
                {mats.map(m => (
                  <button
                    key={m.id}
                    className="material-item"
                    onClick={() => setSelectedMaterial(m)}
                  >
                    <span className="material-icon">{getFileType(m.url)}</span>
                    <span className="material-name">{m.title}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="lesson-actions-panel">
              <div className="panel-section">
                <h3>Посещение</h3>
                {hasAttendance ? (
                  <div className="status-confirmed">Вы отметили посещение</div>
                ) : (
                  <button
                    onClick={() => handleConfirmAttendance(selectedLesson.id)}
                    className="btn btn-primary btn-full"
                    disabled={confirmingAttendance === selectedLesson.id}
                  >
                    {confirmingAttendance === selectedLesson.id ? 'Отмечаем...' : 'Я был на этом уроке'}
                  </button>
                )}
              </div>

              <div className="panel-section">
                <h3>Домашнее задание</h3>
                {!hasAttendance ? (
                  <div className="status-blocked">Сначала отметьте посещение</div>
                ) : hw ? (
                  <div className="status-uploaded">
                    <span className="status-text">Файл: {hw.file_name}</span>
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
                  </div>
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
        </div>
      </div>
    )
  }

  // === VIEW: Selected Module ===
  if (selectedModule) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <button onClick={() => { setSelectedModule(null); setLessons([]); }} className="btn btn-back">
              &larr; Назад к модулям
            </button>
            <h1>{selectedModule.name}</h1>
          </div>
          <button onClick={handleLogout} className="btn btn-outline">
            Выйти
          </button>
        </header>

        <div className="lessons-grid">
          {lessons.length === 0 ? (
            <div className="empty-state">
              <p>Уроков в модуле пока нет.</p>
            </div>
          ) : (
            lessons.map((lesson) => {
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
                    {att && (
                      <span className={`badge ${hw ? 'badge-blue' : 'badge-gray'}`}>
                        {hw ? 'ДЗ сдано' : 'Без ДЗ'}
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
  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div>
          <h1>{groupName || 'Курс C#'}</h1>
          <p>{studentName}</p>
        </div>
        <button onClick={handleLogout} className="btn btn-outline">
          Выйти
        </button>
      </header>

      <div className="modules-grid">
        {modules.length === 0 ? (
          <div className="empty-state">
            <p>Модули пока не добавлены.</p>
          </div>
        ) : (
          modules.map((module) => (
            <div key={module.id} className="module-card">
              <div className="module-card-header">
                <h3>{module.name}</h3>
              </div>
              <button
                onClick={() => {
                  setSelectedModule(module)
                  loadModuleLessons(module.id)
                }}
                className="btn btn-primary btn-sm"
              >
                Открыть
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
