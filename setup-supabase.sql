-- =============================================
-- School Service: Supabase Schema
-- =============================================

-- 1. Профили (расширение auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('student', 'teacher')) DEFAULT 'student',
  group_id UUID
);

-- 2. Группы
CREATE TABLE IF NOT EXISTS groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  teacher_id UUID
);

-- Добавляем FK для profiles.group_id после создания groups
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_group
  FOREIGN KEY (group_id) REFERENCES groups(id)
  ON DELETE SET NULL;

-- 3. Занятия
CREATE TABLE IF NOT EXISTS lessons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  topic TEXT NOT NULL,
  lesson_number INT NOT NULL,
  material_url TEXT
);

-- 4. Посещаемость
CREATE TABLE IF NOT EXISTS attendance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  present BOOLEAN DEFAULT false,
  UNIQUE(lesson_id, student_id)
);

-- 5. Домашние задания
CREATE TABLE IF NOT EXISTS homework (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
  file_url TEXT,
  file_name TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- RLS (Row Level Security)
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework ENABLE ROW LEVEL SECURITY;

-- Profiles: авторизованные видят свой профиль
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Groups: преподаватель видит свои группы
CREATE POLICY "Teachers can view own groups" ON groups
  FOR SELECT USING (auth.uid() = teacher_id);

CREATE POLICY "Teachers can create groups" ON groups
  FOR INSERT WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can delete own groups" ON groups
  FOR DELETE USING (auth.uid() = teacher_id);

-- Groups: ученики видят группу, в которую они входят
CREATE POLICY "Students can view their group" ON groups
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.group_id = groups.id AND profiles.id = auth.uid())
  );

-- Lessons: доступ к урокам группы
CREATE POLICY "View lessons for group" ON lessons
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.group_id = lessons.group_id
      AND profiles.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = lessons.group_id
      AND groups.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can insert lessons" ON lessons
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = lessons.group_id
      AND groups.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Teachers can delete own lessons" ON lessons
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM groups
      WHERE groups.id = lessons.group_id
      AND groups.teacher_id = auth.uid()
    )
  );

-- Attendance: преподаватель управляет, ученики видят своё
CREATE POLICY "Teachers can manage attendance" ON attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM lessons
      JOIN groups ON groups.id = lessons.group_id
      WHERE lessons.id = attendance.lesson_id
      AND groups.teacher_id = auth.uid()
    )
  );

CREATE POLICY "Students can view own attendance" ON attendance
  FOR SELECT USING (auth.uid() = student_id);

-- Homework: ученики загружают и видят своё
CREATE POLICY "Students can manage own homework" ON homework
  FOR ALL USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view homework for their groups" ON homework
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM lessons
      JOIN groups ON groups.id = lessons.group_id
      WHERE lessons.id = homework.lesson_id
      AND groups.teacher_id = auth.uid()
    )
  );
