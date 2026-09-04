import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Group, Lesson, Profile, Attendance, Homework, LessonMaterial, Module, LibraryItem } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
import { showToast } from './Toast'

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
  const [groupLibraryItems, setGroupLibraryItems] = useState<LibraryItem[]>([])
  const [showAddLibraryItem, setShowAddLibraryItem] = useState(false)
  const [newLibType, setNewLibType] = useState<'book' | 'article' | 'link'>('book')
  const [newLibTitle, setNewLibTitle] = useState('')
  const [newLibDesc, setNewLibDesc] = useState('')
  const [newLibUrl, setNewLibUrl] = useState('')
  const [newLibFile, setNewLibFile] = useState<File | null>(null)
  const [uploadingLib, setUploadingLib] = useState(false)
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

    try {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('teacher_id', profileId)

      if (error) throw error
      if (data) {
        setGroups(data)
        loadAllGroupLessons()
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

  const generateLessonSummary = async (lesson: Lesson) => {
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

    try {
      await navigator.clipboard.writeText(text)
      showToast('success', 'Сводка скопирована в буфер обмена')
    } catch {
      showToast('error', 'Не удалось скопировать. Выделите и скопируйте вручную.')
    }

    return text
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

    setCreatingLesson(true)
    const { data: lesson, error } = await supabase.from('lessons').insert({
      group_id: selectedGroup!.id,
      module_id: selectedModule.id,
      date: newLessonDate,
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
        date: newLessonDate,
        lesson_number: newLessonNumber,
        homework_description: newHomeworkDesc || null,
      })
      .eq('id', editingLesson.id)

    if (!error) {
      setEditingLesson(null)
      setNewLessonTopic('')
      setNewHomeworkDesc('')
      if (selectedModule) loadModuleLessons(selectedModule.id)
    }
    setSavingLesson(false)
  }

  const startEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson)
    setNewLessonTopic(lesson.topic)
    setNewLessonDate(lesson.date)
    setNewLessonNumber(lesson.lesson_number)
    setNewHomeworkDesc(lesson.homework_description || '')
    setShowCreateLesson(false)
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

  const handleToggleCompleted = async (lessonId: string, currentValue: boolean) => {
    const { error } = await supabase
      .from('lessons')
      .update({ is_completed: !currentValue })
      .eq('id', lessonId)

    if (!error && selectedModule) {
      loadModuleLessons(selectedModule.id)
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
              <button type="submit" className="btn btn-primary btn-sm" disabled={creatingLesson || savingLesson}>
                {creatingLesson || savingLesson ? '...' : editingLesson ? 'Сохранить' : 'Создать'}
              </button>
              <button type="button" onClick={() => { setShowCreateLesson(false); setEditingLesson(null); setNewMaterials([]); setNewLessonTopic(''); setNewHomeworkDesc(''); }} className="btn btn-outline btn-sm">
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
                        onClick={() => generateLessonSummary(lesson)}
                        className="btn btn-outline btn-xs"
                        title="Сводка для родителей"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                        </svg>
                      </button>
                    )}
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

                  {lesson.homework_description && (
                    <div className="lesson-homework-desc">
                      <span className="hw-desc-label">Домашнее задание:</span>
                      <span className="hw-desc-text">{lesson.homework_description}</span>
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
                            onDoubleClick={() => loadStudentProfile(s)}
                            title={`${s.name} — клик: сменить посещаемость, двойной клик: профиль`}
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
      <div className="dashboard view-enter">
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
                    <button className="student-avatar" onClick={() => loadStudentProfile(s)} title="Открыть профиль">{s.name.charAt(0).toUpperCase()}</button>
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
                              <span className="ph-date">{new Date(l.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
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
        <div>
          <h1>Панель преподавателя</h1>
          <p>Управление группами и курсами</p>
        </div>
        <button onClick={handleLogout} className="btn btn-outline">
          Выйти
        </button>
      </header>

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
          <button onClick={() => {
            const d = new Date()
            d.setDate(d.getDate() - d.getDay() + 1)
            d.setHours(0, 0, 0, 0)
            setCalendarWeekStart(d)
          }} className="btn btn-primary btn-sm">Сегодня</button>
          <button onClick={() => {
            const today = new Date()
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
            generateDaySummary(todayStr)
          }} className="btn btn-outline btn-sm">Сводка за день</button>
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
                    <div key={l.id} className={`calendar-event ${l.is_completed ? 'completed' : 'planned'}`} title={`${l.group_name}: Урок ${l.lesson_number} — ${l.topic}`}>
                      <span className="calendar-event-group">{l.group_name}</span>
                      <span className="calendar-event-num">{l.lesson_number}</span>
                      <span className="calendar-event-topic">{l.topic}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

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
                onClick={() => {
                  setSelectedGroup(group)
                  loadGroupLibrary(group.id)
                  setActiveTab('students')
                }}
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
