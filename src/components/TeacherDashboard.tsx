import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { materialHref } from '../lib/materials'
import { uploadAvatar, uploadModuleCover, MAX_AVATAR_SIZE } from '../lib/avatar'
import type { Group, Lesson, Profile, Attendance, Homework, LessonMaterial, Module, LibraryItem, ModuleTemplate, ModuleTemplateLesson } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { showToast } from './Toast'
import { NotificationBell } from './NotificationBell'

const getContentType = (ext: string): string => {
  switch ((ext || '').toLowerCase()) {
    case 'html': case 'htm': return 'text/html'
    case 'pdf': return 'application/pdf'
    case 'png': return 'image/png'
    case 'jpg': case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'svg': return 'image/svg+xml'
    case 'mp4': return 'video/mp4'
    case 'txt': return 'text/plain'
    case 'json': return 'application/json'
    case 'js': return 'text/javascript'
    case 'css': return 'text/css'
    default: return 'application/octet-stream'
  }
}

const uploadMaterialFile = async (file: File, lessonId: string, index: number): Promise<string | null> => {
  const fileExt = (file.name.split('.').pop() || '').toLowerCase()
  const fileName = `${lessonId}/${Date.now()}-${index}.${fileExt}`

  const { error } = await supabase.storage
    .from('lesson-materials')
    .upload(fileName, file, { contentType: getContentType(fileExt) })

  if (error) {
    console.error('Upload error:', error)
    return null
  }

  const { data } = supabase.storage
    .from('lesson-materials')
    .getPublicUrl(fileName)

  return data.publicUrl
}

export function TeacherDashboard() {
  const teacherId = localStorage.getItem('teacher_id') || ''
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
  const now = new Date()
  const [newLessonDate, setNewLessonDate] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`)
  const [newLessonNumber, setNewLessonNumber] = useState(1)
  const [newHomeworkDesc, setNewHomeworkDesc] = useState('')
  const [newStudentName, setNewStudentName] = useState('')
  const [newMaterials, setNewMaterials] = useState<{title: string; file: File | null; url: string}[]>([])
  const [activeTab, setActiveTab] = useState<'students' | 'journal' | 'homework' | 'library'>('students')
  const [hwModuleLessons, setHwModuleLessons] = useState<Record<string, Lesson[]>>({})
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + 1)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [allGroupLessons, setAllGroupLessons] = useState<(Lesson & { group_name: string })[]>([])
  const [selectedStudentProfile, setSelectedStudentProfile] = useState<Profile | null>(null)
  const [studentProfileData, setStudentProfileData] = useState<{
    attendance: Attendance[]
    homework: Homework[]
    notes: Record<string, string>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [creatingModule, setCreatingModule] = useState(false)
  const [creatingLesson, setCreatingLesson] = useState(false)
  const [addingStudent, setAddingStudent] = useState(false)
  const [savingLesson, setSavingLesson] = useState(false)
  const [markingAttendance, setMarkingAttendance] = useState<string | null>(null)
  const [datesStartDate, setDatesStartDate] = useState('')
  const [assigningDates, setAssigningDates] = useState(false)
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [editingGroupName, setEditingGroupName] = useState('')
  const [savingGroupName, setSavingGroupName] = useState(false)
  const [groupLibraryItems, setGroupLibraryItems] = useState<LibraryItem[]>([])
  const [showAddLibraryItem, setShowAddLibraryItem] = useState(false)
  const [newLibType, setNewLibType] = useState<'book' | 'article' | 'link'>('book')
  const [newLibTitle, setNewLibTitle] = useState('')
  const [newLibDesc, setNewLibDesc] = useState('')
  const [newLibUrl, setNewLibUrl] = useState('')
  const [newLibFile, setNewLibFile] = useState<File | null>(null)
  const [uploadingLib, setUploadingLib] = useState(false)
  const [mainTab, setMainTab] = useState<'groups' | 'schedule' | 'templates'>('groups')
  const [templates, setTemplates] = useState<(ModuleTemplate & { lessons: ModuleTemplateLesson[] })[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [showCreateTemplate, setShowCreateTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [templateLessonsDraft, setTemplateLessonsDraft] = useState<{ topic: string; homework: string }[]>([])
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<(ModuleTemplate & { lessons: ModuleTemplateLesson[] }) | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [applyingTemplate, setApplyingTemplate] = useState(false)
  const [sendingSummary, setSendingSummary] = useState<string | null>(null)
  const [showBindChat, setShowBindChat] = useState(false)
  const [telegramChats, setTelegramChats] = useState<{ id: number; title: string }[]>([])
  const [loadingChats, setLoadingChats] = useState(false)
  const [savingChat, setSavingChat] = useState(false)
  const [sendingDirector, setSendingDirector] = useState(false)
  const [teacherAvatar, setTeacherAvatar] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingCover, setUploadingCover] = useState<string | null>(null)
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

    const { data: ownProfile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', profileId)
      .maybeSingle()
    setTeacherAvatar(ownProfile?.avatar_url ?? null)

    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('teacher_id', profileId)

      if (error) throw error
      if (data) {
        setGroups(data)
        loadAllGroupLessons()
        loadTemplates()
      }
    } catch {
      showToast('error', 'Не удалось загрузить группы')
    } finally {
      setLoading(false)
    }
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

  const handleTeacherAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Можно загружать только изображения')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      showToast('error', 'Файл слишком большой (максимум 5 МБ)')
      return
    }

    const teacherId = localStorage.getItem('teacher_id')
    if (!teacherId) return

    setUploadingAvatar(true)
    try {
      const url = await uploadAvatar(teacherId, file)
      setTeacherAvatar(url)
      showToast('success', 'Фото обновлено')
    } catch {
      showToast('error', 'Не удалось загрузить фото')
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleModuleCoverChange = async (moduleId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Можно загружать только изображения')
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      showToast('error', 'Файл слишком большой (максимум 5 МБ)')
      return
    }

    setUploadingCover(moduleId)
    try {
      const url = await uploadModuleCover(moduleId, file)
      setModules(prev => prev.map(m => m.id === moduleId ? { ...m, cover_url: url } : m))
      setSelectedModule(prev => prev && prev.id === moduleId ? { ...prev, cover_url: url } : prev)
      showToast('success', 'Фото модуля обновлено')
    } catch {
      showToast('error', 'Не удалось загрузить фото модуля')
    } finally {
      setUploadingCover(null)
    }
  }

  const loadGroupLibrary = async (groupId: string) => {
    const { data } = await supabase
      .from('library_items')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })

    if (data) setGroupLibraryItems(data)
  }

  const handleAddGroupLibraryItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroup || !newLibTitle.trim()) return

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

    const teacherId = localStorage.getItem('teacher_id')
    const { error } = await supabase.from('library_items').insert({
      group_id: selectedGroup.id,
      type: newLibType,
      title: newLibTitle.trim(),
      description: newLibDesc.trim() || null,
      url: (newLibType === 'article' || newLibType === 'link') ? newLibUrl.trim() || null : null,
      file_url: fileUrl || null,
      file_name: fileName || null,
      added_by: teacherId || null,
    })

    if (error) {
      showToast('error', 'Не удалось добавить материал')
    } else {
      showToast('success', 'Материал добавлен')
      setNewLibTitle('')
      setNewLibDesc('')
      setNewLibUrl('')
      setNewLibFile(null)
      setShowAddLibraryItem(false)
      loadGroupLibrary(selectedGroup.id)
    }
    setUploadingLib(false)
  }

  const handleDeleteGroupLibraryItem = async (itemId: string) => {
    if (!confirm('Удалить материал?')) return
    const { error } = await supabase.from('library_items').delete().eq('id', itemId)
    if (error) {
      showToast('error', 'Не удалось удалить материал')
    } else {
      showToast('success', 'Материал удалён')
      if (selectedGroup) loadGroupLibrary(selectedGroup.id)
    }
  }

  const loadTemplates = async () => {
    const teacherId = localStorage.getItem('teacher_id')
    if (!teacherId) return
    setLoadingTemplates(true)

    try {
      const { data: templatesData, error } = await supabase
        .from('module_templates')
        .select('*')
        .eq('teacher_id', teacherId)
        .order('created_at', { ascending: false })

      if (error) throw error

      const templateIds = (templatesData || []).map(t => t.id)
      let lessonsByTemplate: Record<string, ModuleTemplateLesson[]> = {}

      if (templateIds.length > 0) {
        const { data: lessonsData } = await supabase
          .from('module_template_lessons')
          .select('*')
          .in('template_id', templateIds)
          .order('sort_order')

        if (lessonsData) {
          lessonsByTemplate = lessonsData.reduce((acc, l) => {
            if (!acc[l.template_id]) acc[l.template_id] = []
            acc[l.template_id].push(l)
            return acc
          }, {} as Record<string, ModuleTemplateLesson[]>)
        }
      }

      setTemplates((templatesData || []).map(t => ({ ...t, lessons: lessonsByTemplate[t.id] || [] })))
    } catch {
      showToast('error', 'Не удалось загрузить шаблоны')
    } finally {
      setLoadingTemplates(false)
    }
  }

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    const teacherId = localStorage.getItem('teacher_id')
    if (!teacherId || !newTemplateName.trim()) return

    setCreatingTemplate(true)
    try {
      let templateId: string

      if (editingTemplate) {
        const { error: updErr } = await supabase
          .from('module_templates')
          .update({ name: newTemplateName.trim() })
          .eq('id', editingTemplate.id)

        if (updErr) throw updErr
        templateId = editingTemplate.id

        const { error: delErr } = await supabase
          .from('module_template_lessons')
          .delete()
          .eq('template_id', templateId)

        if (delErr) throw delErr
      } else {
        const { data: tpl, error: tplErr } = await supabase
          .from('module_templates')
          .insert({ teacher_id: teacherId, name: newTemplateName.trim() })
          .select()
          .single()

        if (tplErr) throw tplErr
        templateId = tpl.id
      }

      const validLessons = templateLessonsDraft.filter(l => l.topic.trim())
      if (validLessons.length > 0) {
        const { error: lessonsErr } = await supabase
          .from('module_template_lessons')
          .insert(validLessons.map((l, i) => ({
            template_id: templateId,
            lesson_number: i + 1,
            topic: l.topic.trim(),
            homework_description: l.homework.trim() || null,
            sort_order: i,
          })))

        if (lessonsErr) throw lessonsErr
      }

      showToast('success', editingTemplate ? 'Шаблон обновлён' : `Шаблон «${newTemplateName.trim()}» создан`)
      setNewTemplateName('')
      setTemplateLessonsDraft([])
      setEditingTemplate(null)
      setShowCreateTemplate(false)
      loadTemplates()
    } catch {
      showToast('error', editingTemplate ? 'Не удалось обновить шаблон' : 'Не удалось создать шаблон')
    } finally {
      setCreatingTemplate(false)
    }
  }

  const startEditTemplate = (tpl: ModuleTemplate & { lessons: ModuleTemplateLesson[] }) => {
    setEditingTemplate(tpl)
    setNewTemplateName(tpl.name)
    setTemplateLessonsDraft(tpl.lessons.map(l => ({
      topic: l.topic,
      homework: l.homework_description || '',
    })))
    setShowCreateTemplate(true)
  }

  const cancelTemplateForm = () => {
    setShowCreateTemplate(false)
    setEditingTemplate(null)
    setNewTemplateName('')
    setTemplateLessonsDraft([])
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Удалить шаблон?')) return
    const { error } = await supabase.from('module_templates').delete().eq('id', templateId)
    if (error) {
      showToast('error', 'Не удалось удалить шаблон')
    } else {
      showToast('success', 'Шаблон удалён')
      loadTemplates()
    }
  }

  const handleApplyTemplate = async (template: ModuleTemplate & { lessons: ModuleTemplateLesson[] }) => {
    if (!selectedGroup) return

    setApplyingTemplate(true)
    try {
      const { data: mod, error: modErr } = await supabase
        .from('modules')
        .insert({
          group_id: selectedGroup.id,
          name: template.name,
          sort_order: modules.length,
        })
        .select()
        .single()

      if (modErr) throw modErr

      if (template.lessons.length > 0) {
        const { error: lessonsErr } = await supabase
          .from('lessons')
          .insert(template.lessons.map(l => ({
            group_id: selectedGroup.id,
            module_id: mod.id,
            date: null,
            topic: l.topic,
            lesson_number: l.lesson_number,
            homework_description: l.homework_description,
          })))

        if (lessonsErr) throw lessonsErr
      }

      showToast('success', `Модуль «${template.name}» добавлен (${template.lessons.length} уроков)`)
      setShowTemplatePicker(false)
      loadGroupData(selectedGroup.id)
    } catch {
      showToast('error', 'Не удалось добавить модуль из шаблона')
    } finally {
      setApplyingTemplate(false)
    }
  }

  const buildLessonSummary = async (lesson: Lesson): Promise<string> => {
    const groupName = selectedGroup?.name || 'Группа'

    const { data: studentsData } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('group_id', lesson.group_id)
      .eq('role', 'student')

    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('student_id, present')
      .eq('lesson_id', lesson.id)

    const students = studentsData || []
    const attendance = attendanceData || []

    const presentNames: string[] = []
    const absentNames: string[] = []

    students.forEach(s => {
      const att = attendance.find(a => a.student_id === s.id)
      if (att?.present) {
        presentNames.push(s.name)
      } else {
        absentNames.push(s.name)
      }
    })

    const dateObj = new Date(lesson.date + 'T00:00:00')
    const dateStr = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

    let text = `${groupName} — Урок ${lesson.lesson_number}: ${lesson.topic}\n`
    text += `Дата: ${dateStr}\n\n`

    text += `Присутствовали (${presentNames.length}):\n`
    text += presentNames.length > 0 ? presentNames.join(', ') : '—'
    text += '\n\n'

    text += `Отсутствовали (${absentNames.length}):\n`
    text += absentNames.length > 0 ? absentNames.join(', ') : '—'

    if (lesson.homework_description) {
      text += `\n\nДомашнее задание:\n${lesson.homework_description}`
    }

    return text
  }

  const sendLessonToTelegram = async (lesson: Lesson) => {
    if (!selectedGroup) return
    if (!selectedGroup.telegram_chat_id) {
      showToast('info', 'Сначала привяжите Telegram-чат группы')
      setShowBindChat(true)
      setTelegramChats([])
      fetchTelegramChats()
      return
    }

    const loginCode = localStorage.getItem('login_code')
    if (!loginCode) {
      showToast('error', 'Код входа не найден. Перевойдите в систему.')
      return
    }

    setSendingSummary(lesson.id)
    try {
      const text = await buildLessonSummary(lesson)
      const { data, error } = await supabase.functions.invoke('send-telegram', {
        body: { action: 'send', login_code: loginCode, group_id: lesson.group_id, text },
      })

      if (error || !data?.ok) {
        showToast('error', data?.error === 'chat_not_bound' ? 'Чат не привязан к группе' : 'Не удалось отправить сводку в Telegram')
        return
      }

      showToast('success', 'Сводка отправлена в Telegram')
    } catch {
      showToast('error', 'Не удалось отправить сводку в Telegram')
    } finally {
      setSendingSummary(null)
    }
  }

  const fetchTelegramChats = async () => {
    if (!selectedGroup) return

    const loginCode = localStorage.getItem('login_code')
    if (!loginCode) {
      showToast('error', 'Код входа не найден. Перевойдите в систему.')
      return
    }

    setLoadingChats(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-telegram', {
        body: { action: 'bind', login_code: loginCode, group_id: selectedGroup.id },
      })

      if (error || !data?.ok) {
        showToast('error', 'Не удалось получить список чатов')
        return
      }

      setTelegramChats(data.chats || [])
    } catch {
      showToast('error', 'Не удалось получить список чатов')
    } finally {
      setLoadingChats(false)
    }
  }

  const setGroupTelegramChat = async (chatId: number | null) => {
    if (!selectedGroup) return

    const loginCode = localStorage.getItem('login_code')
    if (!loginCode) {
      showToast('error', 'Код входа не найден. Перевойдите в систему.')
      return
    }

    setSavingChat(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-telegram', {
        body: { action: 'set_chat', login_code: loginCode, group_id: selectedGroup.id, chat_id: chatId },
      })

      if (error || !data?.ok) {
        showToast('error', chatId === null ? 'Не удалось отвязать чат' : 'Не удалось привязать чат')
        return
      }

      setSelectedGroup({ ...selectedGroup, telegram_chat_id: chatId })
      setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, telegram_chat_id: chatId } : g))

      if (chatId === null) {
        showToast('success', 'Telegram-чат отвязан')
      } else {
        setShowBindChat(false)
        showToast('success', 'Telegram-чат привязан')
      }
    } catch {
      showToast('error', chatId === null ? 'Не удалось отвязать чат' : 'Не удалось привязать чат')
    } finally {
      setSavingChat(false)
    }
  }

  const openLessonFromCalendar = async (lesson: Lesson & { group_name: string }) => {
    const group = groups.find(g => g.id === lesson.group_id)
    if (!group) return

    setSelectedGroup(group)
    loadGroupLibrary(group.id)
    setActiveTab('journal')

    const { data: modulesData } = await supabase
      .from('modules')
      .select('*')
      .eq('group_id', group.id)
      .order('sort_order')

    if (!modulesData || modulesData.length === 0) {
      setSelectedModule(null)
      return
    }

    const mod = modulesData.find(m => m.id === lesson.module_id) || modulesData[0]
    setSelectedModule(mod)
    loadModuleLessons(mod.id)
  }

  const generateDaySummary = async (dateStr: string) => {
    const dayLessons = allGroupLessons.filter(l => l.date === dateStr)
    if (dayLessons.length === 0) {
      showToast('info', 'Нет уроков на эту дату')
      return
    }

    const dateObj = new Date(dateStr + 'T00:00:00')
    const dateFormatted = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

    let text = `Сводка за ${dateFormatted}\n\n`

    for (const lesson of dayLessons) {
      const { data: studentsData } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('group_id', lesson.group_id)
        .eq('role', 'student')

      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('student_id, present')
        .eq('lesson_id', lesson.id)

      const students = studentsData || []
      const attendance = attendanceData || []

      const presentNames: string[] = []
      const absentNames: string[] = []

      students.forEach(s => {
        const att = attendance.find(a => a.student_id === s.id)
        if (att?.present) {
          presentNames.push(s.name)
        } else {
          absentNames.push(s.name)
        }
      })

      text += `${lesson.group_name} — Урок ${lesson.lesson_number}: ${lesson.topic}\n`
      text += `Присутствовали (${presentNames.length}): ${presentNames.length > 0 ? presentNames.join(', ') : '—'}\n`
      text += `Отсутствовали (${absentNames.length}): ${absentNames.length > 0 ? absentNames.join(', ') : '—'}\n`
      if (lesson.homework_description) {
        text += `ДЗ: ${lesson.homework_description}\n`
      }
      text += '\n'
    }

    try {
      await navigator.clipboard.writeText(text.trim())
      showToast('success', 'Сводка за день скопирована')
    } catch {
      showToast('error', 'Не удалось скопировать')
    }
  }

  const sendDirectorReport = async (dateStr: string) => {
    const dayLessons = allGroupLessons.filter(l => l.date === dateStr)
    if (dayLessons.length === 0) {
      showToast('info', 'Нет уроков на эту дату')
      return
    }

    const loginCode = localStorage.getItem('login_code')
    if (!loginCode) {
      showToast('error', 'Код входа не найден. Перевойдите в систему.')
      return
    }

    const dateObj = new Date(dateStr + 'T00:00:00')
    const dateFormatted = dateObj.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })

    let text = `Отчёт за ${dateFormatted}\n`

    for (const lesson of dayLessons) {
      const { data: studentsData } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('group_id', lesson.group_id)
        .eq('role', 'student')

      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('student_id, present')
        .eq('lesson_id', lesson.id)

      const students = studentsData || []
      const attendance = attendanceData || []

      const present = students
        .filter(s => attendance.find(a => a.student_id === s.id)?.present)
        .map(s => s.name)

      text += `\n${lesson.group_name} (${present.length}/${students.length}): ${present.length > 0 ? present.join(', ') : '—'}\n`
    }

    setSendingDirector(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-telegram', {
        body: { action: 'send_director', login_code: loginCode, text: text.trim() },
      })

      if (error || !data?.ok) {
        showToast(
          'error',
          data?.error === 'director_not_bound'
            ? 'Чат директора не подключён. Привяжите его в админ-панели.'
            : 'Не удалось отправить отчёт директору'
        )
        return
      }

      showToast('success', 'Отчёт отправлен директору в Telegram')
    } catch {
      showToast('error', 'Не удалось отправить отчёт директору')
    } finally {
      setSendingDirector(false)
    }
  }

  const loadAllGroupLessons = async () => {
    const teacherId = localStorage.getItem('teacher_id')
    if (!teacherId) return

    const { data: teacherGroups } = await supabase
      .from('groups')
      .select('id, name')
      .eq('teacher_id', teacherId)

    if (!teacherGroups || teacherGroups.length === 0) { setAllGroupLessons([]); return }

    const { data: mods } = await supabase
      .from('modules')
      .select('id, group_id')
      .in('group_id', teacherGroups.map(g => g.id))

    if (!mods || mods.length === 0) { setAllGroupLessons([]); return }

    const { data: less } = await supabase
      .from('lessons')
      .select('*')
      .in('module_id', mods.map(m => m.id))
      .order('date')

    if (!less) { setAllGroupLessons([]); return }

    const groupMap: Record<string, string> = {}
    teacherGroups.forEach(g => { groupMap[g.id] = g.name })

    const modGroupIdMap: Record<string, string> = {}
    mods.forEach(m => { modGroupIdMap[m.id] = m.group_id })

    setAllGroupLessons(less.map(l => ({
      ...l,
      group_id: modGroupIdMap[l.module_id] || l.group_id || '',
      group_name: groupMap[modGroupIdMap[l.module_id]] || ''
    })))
  }

  const loadStudentProfile = async (student: Profile) => {
    setSelectedStudentProfile(student)

    const { data: attData } = await supabase
      .from('attendance')
      .select('*')
      .eq('student_id', student.id)

    const { data: hwData } = await supabase
      .from('homework')
      .select('*')
      .eq('student_id', student.id)

    const { data: notesData } = await supabase
      .from('student_notes')
      .select('*')
      .eq('student_id', student.id)

    const notesMap: Record<string, string> = {}
    if (notesData) {
      notesData.forEach((n: any) => { notesMap[n.lesson_id] = n.content })
    }

    setStudentProfileData({
      attendance: attData || [],
      homework: hwData || [],
      notes: notesMap,
    })
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
    const teacherId = localStorage.getItem('teacher_id')
    if (!teacherId) return

    setCreatingGroup(true)
    const inviteCode = `GRP${Date.now().toString(36).toUpperCase().slice(-6)}`

    const { error } = await supabase.from('groups').insert({
      name: newGroupName,
      invite_code: inviteCode,
      teacher_id: teacherId,
    })

    if (error) {
      showToast('error', 'Не удалось создать группу')
    } else {
      setNewGroupName('')
      setShowCreateGroup(false)
      showToast('success', 'Группа создана')
      loadGroups()
    }
    setCreatingGroup(false)
  }

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedGroup) return

    setCreatingModule(true)
    const { error } = await supabase.from('modules').insert({
      group_id: selectedGroup.id,
      name: newModuleName,
      sort_order: modules.length,
    })

    if (error) {
      showToast('error', 'Не удалось создать модуль')
    } else {
      setNewModuleName('')
      setShowCreateModule(false)
      showToast('success', 'Модуль создан')
      loadGroupData(selectedGroup.id)
    }
    setCreatingModule(false)
  }

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedModule) return

    setCreatingLesson(true)
    const { data: lesson, error } = await supabase.from('lessons').insert({
      group_id: selectedGroup!.id,
      module_id: selectedModule.id,
      date: newLessonDate || null,
      topic: newLessonTopic,
      lesson_number: newLessonNumber,
      homework_description: newHomeworkDesc || null,
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
      setNewHomeworkDesc('')
      setNewMaterials([])
      setShowCreateLesson(false)
      loadModuleLessons(selectedModule.id)
    }
    setCreatingLesson(false)
  }

  const handleEditLesson = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLesson) return

    setSavingLesson(true)
    const { error } = await supabase
      .from('lessons')
      .update({
        topic: newLessonTopic,
        date: newLessonDate || null,
        lesson_number: newLessonNumber,
        homework_description: newHomeworkDesc || null,
      })
      .eq('id', editingLesson.id)

    if (!error) {
      const existingCount = (materialsMap[editingLesson.id] || []).length
      for (let i = 0; i < newMaterials.length; i++) {
        const mat = newMaterials[i]
        if (!mat.title) continue

        let url = mat.url
        if (mat.file) {
          const uploadedUrl = await uploadMaterialFile(mat.file, editingLesson.id, i)
          if (uploadedUrl) url = uploadedUrl
        }

        if (url) {
          const { error: matError } = await supabase.from('lesson_materials').insert({
            lesson_id: editingLesson.id,
            title: mat.title,
            url: url,
            sort_order: existingCount + i,
          })
          if (matError) {
            console.error('Material insert error:', matError)
          }
        }
      }

      const addedCount = newMaterials.filter(m => m.title.trim()).length
      if (addedCount > 0) {
        showToast('success', `Урок сохранён, файлов добавлено: ${addedCount}`)
        if (editingLesson.is_completed) {
          const addedTitles = newMaterials
            .filter(m => m.title.trim())
            .map(m => m.title.trim())
            .join(', ')
          await notifyGroupStudents(
            editingLesson.group_id,
            'material_added',
            `Новый материал к уроку ${editingLesson.lesson_number} (${editingLesson.topic}): ${addedTitles}`,
            editingLesson.id
          )
        }
      } else {
        showToast('success', 'Урок сохранён')
      }

      setEditingLesson(null)
      setNewLessonTopic('')
      setNewHomeworkDesc('')
      setNewMaterials([])
      if (selectedModule) loadModuleLessons(selectedModule.id)
    } else {
      showToast('error', 'Не удалось сохранить урок')
    }
    setSavingLesson(false)
  }

  const startEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson)
    setNewLessonTopic(lesson.topic)
    setNewLessonDate(lesson.date || '')
    setNewLessonNumber(lesson.lesson_number)
    setNewHomeworkDesc(lesson.homework_description || '')
    setNewMaterials([])
    setShowCreateLesson(false)
  }

  const handleRenameGroup = async (groupId: string) => {
    if (!editingGroupName.trim()) return

    setSavingGroupName(true)
    const { error } = await supabase
      .from('groups')
      .update({ name: editingGroupName.trim() })
      .eq('id', groupId)

    if (error) {
      showToast('error', 'Не удалось переименовать группу')
    } else {
      const newName = editingGroupName.trim()
      showToast('success', 'Название группы обновлено')
      setEditingGroup(null)
      setGroups(prev => prev.map(g => g.id === groupId ? { ...g, name: newName } : g))
      setSelectedGroup(prev => prev?.id === groupId ? { ...prev, name: newName } : prev)
      setAllGroupLessons(prev => prev.map(l => l.group_id === groupId ? { ...l, group_name: newName } : l))
    }
    setSavingGroupName(false)
  }

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Удалить группу со всеми модулями и уроками?')) return
    const { error } = await supabase.from('groups').delete().eq('id', groupId)
    if (error) {
      showToast('error', 'Не удалось удалить группу')
    } else {
      showToast('success', 'Группа удалена')
      setSelectedGroup(null)
      setSelectedModule(null)
      loadGroups()
    }
  }

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Удалить модуль со всеми уроками?')) return
    const { error } = await supabase.from('modules').delete().eq('id', moduleId)
    if (error) {
      showToast('error', 'Не удалось удалить модуль')
    } else {
      showToast('success', 'Модуль удалён')
      setSelectedModule(null)
      if (selectedGroup) loadGroupData(selectedGroup.id)
    }
  }

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm('Удалить занятие?')) return
    const { error } = await supabase.from('lessons').delete().eq('id', lessonId)
    if (error) {
      showToast('error', 'Не удалось удалить урок')
    } else {
      showToast('success', 'Урок удалён')
      if (selectedModule) loadModuleLessons(selectedModule.id)
    }
  }

  const handleDeleteMaterial = async (materialId: string) => {
    const { error } = await supabase.from('lesson_materials').delete().eq('id', materialId)
    if (error) {
      showToast('error', 'Не удалось удалить материал')
    } else {
      if (selectedModule) loadModuleLessons(selectedModule.id)
    }
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

    setAddingStudent(true)
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
      showToast('error', 'Не удалось добавить ученика')
      setAddingStudent(false)
      return
    }

    showToast('success', `Ученик добавлен! Код: ${inviteCode}`)
    setNewStudentName('')
    setShowAddStudent(false)
    loadGroupData(selectedGroup.id)
    setAddingStudent(false)
  }

  const handleDeleteStudent = async (studentId: string) => {
    if (!confirm('Удалить ученика?')) return
    const { error } = await supabase.from('profiles').delete().eq('id', studentId)
    if (error) {
      showToast('error', 'Не удалось удалить ученика')
    } else {
      showToast('success', 'Ученик удалён')
      if (selectedGroup) loadGroupData(selectedGroup.id)
    }
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

  const handleMarkAllPresent = async (lessonId: string) => {
    if (students.length === 0) {
      showToast('info', 'В группе нет учеников')
      return
    }

    setMarkingAttendance(lessonId)
    const rows = students.map(s => ({
      lesson_id: lessonId,
      student_id: s.id,
      present: true,
    }))

    const { error } = await supabase
      .from('attendance')
      .upsert(rows, { onConflict: 'lesson_id,student_id' })

    if (error) {
      showToast('error', 'Не удалось отметить учеников')
    } else {
      setAttendanceMap(prev => {
        const lessonMap: Record<string, boolean> = {}
        students.forEach(s => { lessonMap[s.id] = true })
        return { ...prev, [lessonId]: lessonMap }
      })
      showToast('success', 'Все ученики отмечены присутствующими')
    }
    setMarkingAttendance(null)
  }

  const handleAssignDates = async () => {
    if (!selectedModule || !datesStartDate) return

    const undated = lessons.filter(l => !l.date).sort((a, b) => a.lesson_number - b.lesson_number)
    if (undated.length === 0) return

    setAssigningDates(true)
    try {
      const start = new Date(datesStartDate + 'T00:00:00')
      for (let i = 0; i < undated.length; i++) {
        const d = new Date(start)
        d.setDate(d.getDate() + i * 7)
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const { error } = await supabase.from('lessons').update({ date: ds }).eq('id', undated[i].id)
        if (error) throw error
      }

      showToast('success', `Даты расставлены (${undated.length} уроков)`)
      setDatesStartDate('')
      loadModuleLessons(selectedModule.id)
      loadAllGroupLessons()
    } catch {
      showToast('error', 'Не удалось расставить даты')
    } finally {
      setAssigningDates(false)
    }
  }

  useEffect(() => {
    if (mainTab !== 'groups') return
    const q = searchQuery.trim()
    if (q.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const groupIds = groups.map(g => g.id)
        if (groupIds.length === 0) {
          setSearchResults([])
          return
        }
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'student')
          .in('group_id', groupIds)
          .or(`full_name.ilike.%${q}%,name.ilike.%${q}%`)
          .limit(10)

        if (error) throw error
        setSearchResults(data || [])
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery, groups, mainTab])

  const handleSearchResultClick = (student: Profile) => {
    const group = groups.find(g => g.id === student.group_id)
    if (!group) return

    setSearchQuery('')
    setSearchResults([])
    setSelectedGroup(group)
    loadGroupLibrary(group.id)
    setActiveTab('students')
    loadStudentProfile(student)
  }

  const notifyGroupStudents = async (groupId: string, type: string, title: string, lessonId: string) => {
    const { data: groupStudents } = await supabase
      .from('profiles')
      .select('id')
      .eq('group_id', groupId)
      .eq('role', 'student')

    if (!groupStudents || groupStudents.length === 0) return

    await supabase.from('notifications').insert(
      groupStudents.map(s => ({
        recipient_id: s.id,
        type,
        title,
        lesson_id: lessonId,
      }))
    )
  }

  const handleToggleCompleted = async (lessonId: string, currentValue: boolean) => {
    const { error } = await supabase
      .from('lessons')
      .update({ is_completed: !currentValue })
      .eq('id', lessonId)

    if (!error && selectedModule) {
      loadModuleLessons(selectedModule.id)

      if (!currentValue) {
        const lesson = lessons.find(l => l.id === lessonId)
        if (lesson) {
          let title = `Урок ${lesson.lesson_number} завершён: ${lesson.topic}`
          if (lesson.homework_description) title += '. Задано ДЗ'
          await notifyGroupStudents(lesson.group_id, 'lesson_completed', title, lesson.id)
        }
      }
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
      <div className="dashboard view-enter">
        <header className="dashboard-header">
          <div className="header-left">
            <button onClick={() => { setSelectedModule(null); setLessons([]); setEditingLesson(null); }} className="btn btn-back">
              &larr; Назад к модулям
            </button>
            <div className="header-title header-title-with-avatar">
              <label className="module-cover module-cover-lg" title="Загрузить фото модуля">
                {selectedModule.cover_url ? (
                  <img src={selectedModule.cover_url} className="avatar-img" alt="" />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                  </svg>
                )}
                <span className="avatar-edit-overlay">
                  {uploadingCover === selectedModule.id ? '...' : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  )}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="avatar-input"
                  onChange={(e) => handleModuleCoverChange(selectedModule.id, e)}
                  disabled={uploadingCover === selectedModule.id}
                />
              </label>
              <div>
                <h1>{selectedModule.name}</h1>
                <p className="invite-code-inline">Группа: {selectedGroup.name}</p>
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-outline btn-logout">
            Выйти
          </button>
        </header>

        <div className="section-header">
          <h2>Уроки модуля</h2>
          <button onClick={() => { setShowCreateLesson(true); setEditingLesson(null); setNewLessonTopic(''); setNewHomeworkDesc(''); }} className="btn btn-primary btn-sm">
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

            <textarea
              value={newHomeworkDesc}
              onChange={(e) => setNewHomeworkDesc(e.target.value)}
              placeholder="Описание домашнего задания (необязательно)"
              className="input"
              rows={3}
            />

            <div className="materials-section">
              <div className="materials-header">
                <span>{editingLesson ? 'Добавить файлы к уроку' : 'Файлы урока'}</span>
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

            <div className="form-actions">
              <button type="submit" className="btn btn-primary btn-sm" disabled={creatingLesson || savingLesson}>
                {creatingLesson || savingLesson ? '...' : editingLesson ? 'Сохранить' : 'Создать'}
              </button>
              <button type="button" onClick={() => { setShowCreateLesson(false); setEditingLesson(null); setNewMaterials([]); setNewLessonTopic(''); setNewHomeworkDesc(''); }} className="btn btn-outline btn-sm">
                Отмена
              </button>
            </div>
          </form>
        )}

        {lessons.some(l => !l.date) && (
          <div className="assign-dates-panel">
            <span className="assign-dates-label">
              Уроков без дат: {lessons.filter(l => !l.date).length}
            </span>
            <input
              type="date"
              value={datesStartDate}
              onChange={(e) => setDatesStartDate(e.target.value)}
              className="input input-sm"
            />
            <button
              onClick={handleAssignDates}
              className="btn btn-primary btn-sm"
              disabled={!datesStartDate || assigningDates}
            >
              {assigningDates ? '...' : 'Расставить (+7 дней)'}
            </button>
          </div>
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
              const expanded = expandedLesson === lesson.id || isEditing
              return (
                <div key={lesson.id} className={`lesson-item ${isEditing ? 'lesson-editing' : ''} ${expanded ? 'lesson-expanded' : ''}`}>
                  <div
                    className="lesson-item-header"
                    onClick={() => setExpandedLesson(expanded ? null : lesson.id)}
                  >
                    <span className={`lesson-chevron ${expanded ? 'open' : ''}`}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="9,18 15,12 9,6"/>
                      </svg>
                    </span>
                    <span className="lesson-number">{lesson.lesson_number}</span>
                    <span className="lesson-date">{lesson.date ? new Date(lesson.date).toLocaleDateString('ru-RU') : '—'}</span>
                    <span className="lesson-topic-text">{lesson.topic}</span>
                    <span className="lesson-stats">
                      {attCount}/{students.length} посещ.
                      {hwCount > 0 && ` | ${hwCount} ДЗ`}
                    </span>
                    <div className="lesson-item-actions" onClick={(e) => e.stopPropagation()}>
                      <label className="lesson-completed-toggle" title={lesson.is_completed ? 'Завершён' : 'В процессе'}>
                        <input
                          type="checkbox"
                          checked={lesson.is_completed}
                          onChange={() => handleToggleCompleted(lesson.id, lesson.is_completed)}
                        />
                        <span className={`toggle-mark ${lesson.is_completed ? 'done' : ''}`}>
                          {lesson.is_completed ? '✓' : '○'}
                        </span>
                      </label>
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
                      {lesson.is_completed && (
                        <button
                          onClick={() => sendLessonToTelegram(lesson)}
                          className="btn btn-outline btn-xs"
                          title="Отправить сводку в Telegram"
                          disabled={sendingSummary === lesson.id}
                        >
                          {sendingSummary === lesson.id ? '...' : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M21.9 4.6l-3.1 14.7c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.4-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.3 12.9 1.5 11.4c-1-.3-1-1 .2-1.5l18.8-7.2c.9-.3 1.6.2 1.4 1.9z"/>
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <>
                      {mats.length > 0 && (
                        <div className="lesson-materials">
                          {mats.map(m => (
                            <div key={m.id} className="material-tag">
                              <span className="material-icon">{getFileIcon(m.url)}</span>
                              <a href={materialHref(m.url, m.title)} target="_blank" rel="noopener noreferrer">{m.title}</a>
                              <button onClick={() => handleDeleteMaterial(m.id)} className="material-remove">
                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M2 2l8 8M10 2l-8 8"/>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {lesson.homework_description && (
                        <div className="lesson-homework-desc">
                          <span className="hw-desc-label">Домашнее задание:</span>
                          <span className="hw-desc-text">{lesson.homework_description}</span>
                        </div>
                      )}

                      <div className="lesson-attendance">
                        <div className="lesson-attendance-header">
                          <span className="lesson-attendance-title">Посещаемость:</span>
                          <button
                            onClick={() => handleMarkAllPresent(lesson.id)}
                            className="btn btn-outline btn-xs"
                            disabled={markingAttendance === lesson.id}
                            title="Отметить всех учеников присутствующими"
                          >
                            {markingAttendance === lesson.id ? '...' : 'Отметить всех'}
                          </button>
                        </div>
                        <div className="attendance-students">
                          {students.map(s => {
                            const present = attMap[s.id] === true
                            return (
                              <button
                                key={s.id}
                                className={`attendance-chip ${present ? 'present' : 'absent'}`}
                                onClick={() => handleToggleAttendance(lesson.id, s.id, present)}
                                onDoubleClick={() => loadStudentProfile(s)}
                                title={`${s.name} — клик: сменить посещаемость, двойной клик: профиль`}
                              >
                                <span className="attendance-avatar">
                                  {s.avatar_url ? <img src={s.avatar_url} className="avatar-img" alt="" /> : s.name.charAt(0).toUpperCase()}
                                </span>
                                <span className="attendance-name">{s.name.split(' ')[0]}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
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
      <div className="dashboard view-enter">
        <header className="dashboard-header">
          <div className="header-left">
            <button onClick={() => { setSelectedGroup(null); setSelectedModule(null); }} className="btn btn-back">
              &larr; Назад к группам
            </button>
            <div className="header-title">
              <h1>{selectedGroup.name}</h1>
            </div>
          </div>
          <div className="header-actions">
            <NotificationBell recipientId={teacherId} />
            <button onClick={handleLogout} className="btn btn-outline btn-logout">
              Выйти
            </button>
          </div>
        </header>

        <div className="telegram-bar">
          {selectedGroup.telegram_chat_id ? (
            <>
              <span className="tg-status tg-status-ok">✓ Родительский Telegram-чат подключён</span>
              <div className="tg-actions">
                <button
                  onClick={() => { setShowBindChat(true); setTelegramChats([]); fetchTelegramChats() }}
                  className="btn btn-outline btn-xs"
                  disabled={savingChat}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                  </svg>
                  Изменить
                </button>
                <button onClick={() => setGroupTelegramChat(null)} className="btn btn-outline btn-xs" disabled={savingChat}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 7h3a5 5 0 010 10h-3m-6 0H6A5 5 0 016 7h3m2 5h2"/>
                  </svg>
                  Отвязать
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="tg-status">Telegram-чат не подключён</span>
              <button
                onClick={() => { setShowBindChat(true); setTelegramChats([]); fetchTelegramChats() }}
                className="btn btn-outline btn-xs"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
                Привязать чат
              </button>
            </>
          )}
        </div>

        {showBindChat && (
          <div className="telegram-bind">
            <div className="telegram-bind-header">
              <span>Привязка Telegram-чата</span>
              <button onClick={() => setShowBindChat(false)} className="btn btn-outline btn-xs">✕</button>
            </div>
            <p className="telegram-bind-hint">
              Для группы: добавьте бота в родительский чат и напишите там любое сообщение.
              Для личной отправки: пользователь открывает бота и нажимает «Запустить».
              Затем нажмите «Обновить список» и выберите чат.
            </p>
            <button onClick={fetchTelegramChats} className="btn btn-outline btn-sm" disabled={loadingChats}>
              {loadingChats ? 'Загрузка...' : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                  </svg>
                  Обновить список
                </>
              )}
            </button>
            {loadingChats ? null : telegramChats.length === 0 ? (
              <p className="telegram-bind-empty">
                Чаты не найдены. Добавьте бота в чат группы или нажмите «Запустить» у бота в Telegram, затем «Обновить список».
              </p>
            ) : (
              <div className="telegram-bind-list">
                {telegramChats.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setGroupTelegramChat(c.id)}
                    className="btn btn-outline btn-sm"
                    disabled={savingChat}
                  >
                    {c.title || `Чат ${c.id}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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
          <button
            className={`tab ${activeTab === 'library' ? 'active' : ''}`}
            onClick={() => setActiveTab('library')}
          >
            Библиотека
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
                  <button type="submit" className="btn btn-primary" disabled={addingStudent}>{addingStudent ? '...' : 'Добавить'}</button>
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
                    <button className="student-avatar" onClick={() => loadStudentProfile(s)} title="Открыть профиль">
                      {s.avatar_url ? <img src={s.avatar_url} className="avatar-img" alt="" /> : s.name.charAt(0).toUpperCase()}
                    </button>
                    <div className="student-info">
                      <button className="student-name" onClick={() => loadStudentProfile(s)} title="Открыть профиль">{s.name}</button>
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
              <div className="section-header-actions">
                <button onClick={() => { setShowTemplatePicker(true); loadTemplates() }} className="btn btn-outline btn-sm">
                  Из шаблона
                </button>
                <button onClick={() => setShowCreateModule(true)} className="btn btn-primary btn-sm">
                  + Создать модуль
                </button>
              </div>
            </div>

            {showTemplatePicker && (
              <div className="template-picker">
                <div className="template-picker-header">
                  <span>Выберите шаблон для группы «{selectedGroup?.name}»</span>
                  <button onClick={() => setShowTemplatePicker(false)} className="btn btn-outline btn-xs">✕</button>
                </div>
                {loadingTemplates && templates.length === 0 ? (
                  <p className="template-picker-empty">Загрузка...</p>
                ) : templates.length === 0 ? (
                  <p className="template-picker-empty">Шаблонов нет. Создайте их на вкладке «Шаблоны модулей» главного экрана.</p>
                ) : (
                  <div className="template-picker-list">
                    {templates.map(tpl => (
                      <button
                        key={tpl.id}
                        onClick={() => handleApplyTemplate(tpl)}
                        className="template-picker-item"
                        disabled={applyingTemplate}
                      >
                        <span className="template-picker-name">{tpl.name}</span>
                        <span className="template-picker-count">{tpl.lessons.length} уроков</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

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
                  <button type="submit" className="btn btn-primary btn-sm" disabled={creatingModule}>{creatingModule ? '...' : 'Создать'}</button>
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
                      <div className="module-card-title">
                        <label className="module-cover" title="Загрузить фото модуля">
                          {module.cover_url ? (
                            <img src={module.cover_url} className="avatar-img" alt="" />
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <rect x="3" y="3" width="18" height="18" rx="2"/>
                              <circle cx="8.5" cy="8.5" r="1.5"/>
                              <path d="M21 15l-5-5L5 21"/>
                            </svg>
                          )}
                          <span className="avatar-edit-overlay">
                            {uploadingCover === module.id ? '...' : (
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
                            onChange={(e) => handleModuleCoverChange(module.id, e)}
                            disabled={uploadingCover === module.id}
                          />
                        </label>
                        <h3>{module.name}</h3>
                      </div>
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
                              <span className="homework-lesson-date">{lesson.date ? new Date(lesson.date).toLocaleDateString('ru-RU') : '—'}</span>
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
                                      <span className="homework-student-avatar">
                                        {s.avatar_url ? <img src={s.avatar_url} className="avatar-img" alt="" /> : s.name.charAt(0).toUpperCase()}
                                      </span>
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

        {selectedStudentProfile && studentProfileData && (
          <div className="student-profile-overlay" onClick={() => setSelectedStudentProfile(null)}>
            <div className="student-profile-card" onClick={e => e.stopPropagation()}>
              <div className="student-profile-header">
                <button onClick={() => setSelectedStudentProfile(null)} className="btn btn-back">&larr; Назад</button>
                <h2>{selectedStudentProfile.name}</h2>
                <span className="student-profile-code">{selectedStudentProfile.invite_code || '-'}</span>
              </div>

              {(() => {
                const studentLessons = allGroupLessons.filter(l => l.group_id === selectedStudentProfile.group_id)
                const attended = studentProfileData.attendance.filter(a => a.present).length
                const submitted = studentProfileData.homework.length
                const total = studentLessons.length
                const percent = total > 0 ? Math.round((attended / total) * 100) : 0

                return (
                  <>
                    <div className="student-profile-stats">
                      <div className="stat-card">
                        <span className="stat-value">{total}</span>
                        <span className="stat-label">Уроков</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-value">{attended}</span>
                        <span className="stat-label">Посещено</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-value">{submitted}</span>
                        <span className="stat-label">ДЗ сдано</span>
                      </div>
                      <div className="stat-card">
                        <span className="stat-value">{percent}%</span>
                        <span className="stat-label">Посещаемость</span>
                      </div>
                    </div>

                    <h3>История уроков</h3>
                    <div className="student-profile-history">
                      {studentLessons.length === 0 ? (
                        <p className="empty-text">Уроков пока нет</p>
                      ) : (
                        studentLessons.map(l => {
                          const att = studentProfileData.attendance.find(a => a.lesson_id === l.id && a.present)
                          const hw = studentProfileData.homework.find(h => h.lesson_id === l.id)
                          const note = studentProfileData.notes[l.id]
                          return (
                            <div key={l.id} className="profile-history-row">
                              <span className="ph-date">{l.date ? new Date(l.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : '—'}</span>
                              <span className="ph-topic">Урок {l.lesson_number}: {l.topic}</span>
                              <span className={`ph-badge ${att ? 'green' : 'red'}`}>{att ? 'Посещён' : 'Пропущен'}</span>
                              <span className={`ph-badge ${hw ? 'blue' : 'gray'}`}>{hw ? 'ДЗ сдано' : 'Без ДЗ'}</span>
                              {note && <span className="ph-note" title={note}>📝</span>}
                            </div>
                          )
                        })
                      )}
                    </div>

                    {Object.keys(studentProfileData.notes).length > 0 && (
                      <>
                        <h3>Заметки</h3>
                        <div className="student-profile-notes">
                          {Object.entries(studentProfileData.notes).map(([lessonId, content]) => {
                            const lesson = studentLessons.find(l => l.id === lessonId)
                            return (
                              <div key={lessonId} className="profile-note-item">
                                <span className="pn-lesson">Урок {lesson?.lesson_number || '?'}</span>
                                <p>{content}</p>
                              </div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {activeTab === 'library' && (
          <div className="teacher-section">
            <div className="section-header">
              <h2>Библиотека группы ({groupLibraryItems.length})</h2>
              <button onClick={() => setShowAddLibraryItem(true)} className="btn btn-primary btn-sm">
                + Добавить
              </button>
            </div>

            {showAddLibraryItem && (
              <form onSubmit={handleAddGroupLibraryItem} className="create-form" style={{ marginBottom: 24 }}>
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

            {groupLibraryItems.length === 0 ? (
              <div className="empty-state"><p>Библиотека пуста</p></div>
            ) : (
              <div className="library-list">
                {groupLibraryItems.map(item => (
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
                        {item.type === 'book' ? 'Книга' : item.type === 'article' ? 'Статья' : 'Ссылка'}
                        {item.file_name ? ` · ${item.file_name}` : ''}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteGroupLibraryItem(item.id)}
                      className="btn btn-danger btn-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // === VIEW: Groups List ===
  if (loading) {
    return (
      <div className="dashboard">
        <header className="dashboard-header">
          <div>
            <h1>Панель преподавателя</h1>
            <p>Управление группами и курсами</p>
          </div>
        </header>
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
        <div className="header-title header-title-with-avatar">
          <label className="avatar-editable" title="Изменить фото">
            {teacherAvatar ? (
              <img src={teacherAvatar} className="avatar-img" alt="" />
            ) : (
              <span className="avatar-letter">👤</span>
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
              onChange={handleTeacherAvatarChange}
              disabled={uploadingAvatar}
            />
          </label>
          <div>
            <h1>Панель преподавателя</h1>
            <p>Управление группами и курсами</p>
          </div>
        </div>
        <div className="header-actions">
          <NotificationBell recipientId={teacherId} />
          <button onClick={handleLogout} className="btn btn-outline btn-logout">
            Выйти
          </button>
        </div>
      </header>

      <div className="tabs">
        <button className={`tab ${mainTab === 'groups' ? 'active' : ''}`} onClick={() => setMainTab('groups')}>
          Группы ({groups.length})
        </button>
        <button className={`tab ${mainTab === 'schedule' ? 'active' : ''}`} onClick={() => setMainTab('schedule')}>
          Расписание
        </button>
        <button className={`tab ${mainTab === 'templates' ? 'active' : ''}`} onClick={() => { setMainTab('templates'); if (templates.length === 0) loadTemplates() }}>
          Шаблоны модулей
        </button>
      </div>

      {mainTab === 'groups' && (<>
      <div className="section-header">
        <h2>Мои группы</h2>
        <button onClick={() => setShowCreateGroup(true)} className="btn btn-primary">
          + Создать группу
        </button>
      </div>

      <div className="student-search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск ученика по имени..."
          className="input"
        />
        {searchQuery.trim().length >= 2 && (
          <div className="search-results">
            {searching ? (
              <p className="search-empty">Поиск...</p>
            ) : searchResults.length === 0 ? (
              <p className="search-empty">Ничего не найдено</p>
            ) : (
              searchResults.map(s => {
                const group = groups.find(g => g.id === s.group_id)
                return (
                  <button key={s.id} className="search-result-item" onClick={() => handleSearchResultClick(s)}>
                    <span className="search-result-avatar">{(s.full_name || s.name).charAt(0)}</span>
                    <span className="search-result-name">{s.full_name || s.name}</span>
                    <span className="search-result-group">{group?.name || '—'}</span>
                  </button>
                )
              })
            )}
          </div>
        )}
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
            <button type="submit" className="btn btn-primary btn-sm" disabled={creatingGroup}>{creatingGroup ? '...' : 'Создать'}</button>
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
          {groups.map(group => {
            const lessonsCount = allGroupLessons.filter(l => l.group_id === group.id).length
            return (
              <div key={group.id} className="group-card">
                {editingGroup === group.id ? (
                  <div className="group-card-left group-rename">
                    <div className="group-avatar">{group.name.charAt(0)}</div>
                    <input
                      type="text"
                      value={editingGroupName}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameGroup(group.id)
                        if (e.key === 'Escape') setEditingGroup(null)
                      }}
                      className="input"
                      autoFocus
                    />
                    <button onClick={() => handleRenameGroup(group.id)} className="btn btn-primary btn-xs" disabled={savingGroupName}>
                      {savingGroupName ? '...' : 'OK'}
                    </button>
                    <button onClick={() => setEditingGroup(null)} className="btn btn-outline btn-xs">
                      ✕
                    </button>
                  </div>
                ) : (
                  <div
                    className="group-card-left"
                    onClick={() => {
                      setSelectedGroup(group)
                      loadGroupLibrary(group.id)
                      setActiveTab('students')
                    }}
                  >
                    <div className="group-avatar">{group.name.charAt(0)}</div>
                    <div className="group-card-info">
                      <div className="group-card-name">{group.name}</div>
                    </div>
                  </div>
                )}
                <div className="group-card-right">
                  <span className="group-stat" title="Уроков в группе">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {lessonsCount}
                  </span>
                  <button
                    onClick={() => {
                      setEditingGroup(group.id)
                      setEditingGroupName(group.name)
                    }}
                    className="btn btn-outline btn-xs"
                    title="Переименовать группу"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M8.5 1.5l2 2M1 11l.5-2.5L9 1l2 2L3.5 10.5 1 11z"/>
                    </svg>
                  </button>
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
              </div>
            )
          })}
        </div>
      )}
      </>)}

      {mainTab === 'schedule' && (<>
      {(() => {
        const now = new Date()
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const todayLessons = allGroupLessons.filter(l => l.date === todayStr)
        if (todayLessons.length === 0) return null
        return (
          <div className="today-lessons-panel">
            <div className="today-lessons-title">Уроки сегодня ({todayLessons.length})</div>
            {todayLessons.map(l => (
              <div key={l.id} className="today-lesson-row">
                <span className={`today-lesson-status ${l.is_completed ? 'done' : ''}`} />
                <span className="today-lesson-group">{l.group_name}</span>
                <span className="today-lesson-topic">Урок {l.lesson_number}: {l.topic}</span>
                <button onClick={() => openLessonFromCalendar(l)} className="btn btn-outline btn-xs">
                  Открыть
                </button>
              </div>
            ))}
          </div>
        )
      })()}
      <div className="teacher-section">
        <div className="calendar-header">
          <button onClick={() => {
            const d = new Date(calendarWeekStart)
            d.setDate(d.getDate() - 7)
            setCalendarWeekStart(d)
          }} className="btn btn-outline btn-sm">&larr;</button>
          <h2>
            {calendarWeekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
            {' — '}
            {new Date(calendarWeekStart.getTime() + 6 * 86400000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          </h2>
          <button onClick={() => {
            const d = new Date(calendarWeekStart)
            d.setDate(d.getDate() + 7)
            setCalendarWeekStart(d)
          }} className="btn btn-outline btn-sm">&rarr;</button>
        </div>
        <div className="calendar-grid">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((dayName, i) => {
            const dayDate = new Date(calendarWeekStart)
            dayDate.setDate(dayDate.getDate() + i)
            const dateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`
            const dayLessons = allGroupLessons.filter(l => l.date === dateStr)
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
                      title={`${l.group_name}: Урок ${l.lesson_number} — ${l.topic}`}
                      onClick={() => openLessonFromCalendar(l)}
                    >
                      <span className="calendar-event-group">{l.group_name}</span>
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
            setCalendarWeekStart(d)
          }} className="btn btn-outline btn-sm">Сегодня</button>
          <button onClick={() => {
            const today = new Date()
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
            generateDaySummary(todayStr)
          }} className="btn btn-outline btn-sm">Сводка за день</button>
          <button onClick={() => {
            const today = new Date()
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
            sendDirectorReport(todayStr)
          }} className="btn btn-outline btn-sm" disabled={sendingDirector}>
            {sendingDirector ? '...' : 'Отчёт директору'}
          </button>
        </div>
      </div>
      </>)}

      {mainTab === 'templates' && (
        <div className="teacher-section">
          <div className="section-header">
            <h2>Шаблоны модулей</h2>
            <button onClick={() => { setEditingTemplate(null); setShowCreateTemplate(true); setTemplateLessonsDraft([{ topic: '', homework: '' }]) }} className="btn btn-primary btn-sm">
              + Создать шаблон
            </button>
          </div>
          <p className="template-hint">Готовые модули с уроками и домашними заданиями. Добавляйте их в группы одним кликом — вкладка «Модули и уроки» → «Из шаблона».</p>

          {showCreateTemplate && (
            <form onSubmit={handleCreateTemplate} className="create-form">
              <div className="form-hint">{editingTemplate ? `Редактирование: ${editingTemplate.name}` : 'Новый шаблон'}</div>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Название модуля (например: Модуль 1 — Основы C#)"
                className="input"
                required
              />
              <div className="template-lessons-draft">
                {templateLessonsDraft.map((l, i) => (
                  <div key={i} className="material-row">
                    <span className="template-lesson-num">{i + 1}</span>
                    <input
                      type="text"
                      value={l.topic}
                      onChange={(e) => {
                        const updated = [...templateLessonsDraft]
                        updated[i].topic = e.target.value
                        setTemplateLessonsDraft(updated)
                      }}
                      placeholder="Тема урока"
                      className="input"
                    />
                    <input
                      type="text"
                      value={l.homework}
                      onChange={(e) => {
                        const updated = [...templateLessonsDraft]
                        updated[i].homework = e.target.value
                        setTemplateLessonsDraft(updated)
                      }}
                      placeholder="Домашнее задание (необязательно)"
                      className="input"
                    />
                    <button type="button" onClick={() => setTemplateLessonsDraft(templateLessonsDraft.filter((_, j) => j !== i))} className="btn btn-danger btn-xs">
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l8 8M10 2l-8 8"/></svg>
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setTemplateLessonsDraft([...templateLessonsDraft, { topic: '', homework: '' }])} className="btn btn-outline btn-sm">
                  + Добавить урок
                </button>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={creatingTemplate}>{creatingTemplate ? '...' : editingTemplate ? 'Сохранить' : 'Создать шаблон'}</button>
                <button type="button" onClick={cancelTemplateForm} className="btn btn-outline btn-sm">Отмена</button>
              </div>
            </form>
          )}

          {loadingTemplates && templates.length === 0 ? (
            <div className="groups-grid">
              <div className="skeleton skeleton-card" />
              <div className="skeleton skeleton-card" />
            </div>
          ) : templates.length === 0 ? (
            <div className="empty-state">
              <p>Шаблонов пока нет. Создайте первый шаблон модуля.</p>
            </div>
          ) : (
            <div className="groups-grid">
              {templates.map(tpl => (
                <div key={tpl.id} className="group-card">
                  <div className="group-card-left" style={{ cursor: 'default' }}>
                    <div className="group-avatar template-avatar">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </div>
                    <div className="group-card-info">
                      <div className="group-card-name">{tpl.name}</div>
                      <span className="group-card-code">{tpl.lessons.length} уроков</span>
                    </div>
                  </div>
                  <div className="group-card-right">
                    <button
                      onClick={() => startEditTemplate(tpl)}
                      className="btn btn-outline btn-xs"
                      title="Редактировать шаблон"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M8.5 1.5l2 2M1 11l.5-2.5L9 1l2 2L3.5 10.5 1 11z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(tpl.id)}
                      className="btn btn-danger btn-xs"
                      title="Удалить шаблон"
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2l8 8M10 2l-8 8"/></svg>
                    </button>
                  </div>
                  {tpl.lessons.length > 0 && (
                    <div className="template-lessons-list">
                      {tpl.lessons.map(l => (
                        <div key={l.id} className="template-lesson-row">
                          <span className="template-lesson-num">{l.lesson_number}</span>
                          <span className="template-lesson-topic">{l.topic}</span>
                          {l.homework_description && <span className="template-lesson-hw">ДЗ</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
