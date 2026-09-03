import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profile = {
  id: string
  name: string
  full_name: string | null
  role: 'student' | 'teacher' | 'admin'
  group_id: string | null
  login_code: string | null
  invite_code: string | null
  price_per_lesson: number | null
  bonus_per_student: number | null
}

export type Group = {
  id: string
  name: string
  invite_code: string
  teacher_id: string
}

export type Lesson = {
  id: string
  group_id: string
  module_id: string | null
  date: string
  topic: string
  lesson_number: number
  material_url: string | null
  homework_description: string | null
}

export type Module = {
  id: string
  group_id: string
  name: string
  sort_order: number
}

export type Attendance = {
  id: string
  lesson_id: string
  student_id: string
  present: boolean
}

export type Homework = {
  id: string
  student_id: string
  lesson_id: string
  file_url: string | null
  file_name: string | null
  submitted_at: string
}

export type LessonMaterial = {
  id: string
  lesson_id: string
  title: string
  url: string
  sort_order: number
}

export type StudentNote = {
  id: string
  student_id: string
  lesson_id: string
  content: string
  created_at: string
  updated_at: string
}
