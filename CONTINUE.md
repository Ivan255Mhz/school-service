# School Service «Speak м.Купчино» — Handoff для работы с другого ПК

Документ для продолжения работы. Прочитай его целиком перед началом (для человека и для AI-агента в OpenCode).

---

## 1. Что это за проект

Веб-платформа управления школьной студией «Speak м.Купчино»:

- **Стек:** React 18 + TypeScript + Vite + Supabase (Postgres + Storage + Auth анонимная) + Vercel
- **Роли:** Ученик / Преподаватель / Админ (вход по кодам, роль хранится в localStorage)
- **Прод:** https://school-service-nine.vercel.app (автодеплой из ветки `main`)
- **Репозиторий:** https://github.com/Ivan255Mhz/school-service.git (ветка `main`)

---

## 2. Быстрый старт на новом ПК

```bash
# 1. Нужен Node.js 18+ (https://nodejs.org) и git
node -v

# 2. Клонировать
git clone https://github.com/Ivan255Mhz/school-service.git
cd school-service

# 3. Зависимости
npm install

# 4. Создать .env.local (в корне) с содержимым из раздела «Доступы» ниже
#    (или скопировать .env.example и подставить реальный ключ)

# 5. Запуск
npm run dev

# Сборка/проверка перед коммитом
npm run build
```

Учётка GitHub уже настроена на рабочем ПК; дома при первом `git push` нужно будет авторизоваться (git credential manager / `gh auth login`).

---

## 3. Доступы

### Supabase
- **Project URL:** `https://vduonltjzejrnnrujtkz.supabase.co`
- **Anon key (публичный по дизайну, вставить в .env.local):**
```
VITE_SUPABASE_URL=https://vduonltjzejrnnrujtkz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkdW9ubHRqemVqcm5ucnVqdGt6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMjY2NjMsImV4cCI6MjEwMzkwMjY2M30.deQn2mGHoT8EYhiRyluF0T3csBZAhW6984fjB4ZsG4c
```

### Коды входа в приложение
- **Админ:** код `ADM-7K4X2P` (вход: страница `/admin` или плашка внизу окна входа)
- **Преподаватели:** коды `TCH-XXXXXX` (создаёт админ в панели)
- **Ученики:** персональные коды `STU-XXXXXX` (создаёт преподаватель при добавлении в группу)

### Supabase Management API (для SQL через PowerShell)
PAT-токен взять здесь (логин = GitHub): https://supabase.com/dashboard/account/tokens
> Это секрет — не коммитить, не публиковать.

Выполнять SQL без панели:
```powershell
$PAT = "вставь_свой_PAT_отсюда"  # https://supabase.com/dashboard/account/tokens
$headers = @{ "Authorization" = "Bearer $PAT"; "Content-Type" = "application/json" }
$body = '{ "query": "SELECT ..." }'
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/vduonltjzejrnnrujtkz/database/query" -Method POST -Headers $headers -Body $body
```

**RLS:** во всех таблицах открытые политики (`FOR ALL USING (true)`). Auth — анонимная.

### Storage buckets (public)
- `homework` — ДЗ учеников
- `lesson-materials` — материалы уроков
- `library` — книги/файлы библиотеки (лимит 50MB)

---

## 4. Структура проекта

```
src/
  App.tsx                    маршруты (+ /material viewer, /admin gate)
  index.css                  все стили (тёмная тема, CSS-переменные)
  lib/supabase.ts            клиент + типы (Profile, Lesson, Group, ...)
  lib/materials.ts           materialHref/isHtmlUrl (HTML-материалы через /material)
  components/
    LoginScreen.tsx          вход ученик/преподаватель (+ плашка «Войти как администратор»)
    AdminGate.tsx            скрытый вход админа по URL /admin + код
    AdminDashboard.tsx       4 таба: Преподаватели / Расписание / Оплата / Библиотека
    TeacherDashboard.tsx     3 таба: Группы / Расписание / Шаблоны; в группе:
                             Ученики / Модули и уроки / ДЗ / Библиотека группы
    StudentDashboard.tsx     3 таба: Уроки / Расписание (календарь) / Библиотека
    MaterialViewer.tsx       рендер HTML-материалов в sandbox iframe
    Toast.tsx                showToast('success'|'error'|'info', msg)
```

Таблицы Supabase: `profiles, groups, lessons, modules, attendance, homework,
lesson_materials, student_notes, library_items, module_templates, module_template_lessons`

Ключевые колонки:
- `groups.price_per_lesson`, `groups.bonus_per_student` — цены **на группу** (не на преподавателя)
- `lessons.date` — **nullable** (уроки из шаблонов копируются без дат)
- `lessons.is_completed`, `lessons.homework_description`

---

## 5. Текущее состояние (всё реализовано и на проде)

- ✅ Вход по кодам: ученик STU-, преподаватель TCH-, админ ADM- (прямым URL /admin)
- ✅ Преподаватель: группы (+переименование, без кодов приглашений), модули, уроки
  (сворачиваемые карточки, клонирование +7 дней, материалы при редактировании,
  отметка всех присутствующих, завершение урока, сводка для родителей в буфер)
- ✅ Календарь у преподавателя — вкладка «Расписание» (клик по событию открывает урок)
- ✅ Шаблоны модулей: библиотека шаблонов + применение в группу (уроки без дат,
  массовая расстановка дат +7 дней), редактирование шаблонов
- ✅ Ученик: уроки, расписание-календарь, страница урока (действия сверху),
  ДЗ, заметки, библиотека (книги/статьи/материалы уроков)
- ✅ Админ: преподаватели (цены по группам), расписание с фильтрами, оплата,
  библиотека
- ✅ UX: toast-уведомления, skeleton-загрузки, кнопки «Назад» слева / «Выйти» справа
  (курсив), SVG-иконки, тёмная тема, mobile-friendly
- ✅ HTML-материалы рендерятся через /material (Supabase отдаёт их без Content-Type)

---

## 6. Известные нюансы

- **Часовые пояса:** даты формировать через `getFullYear()/getMonth()/getDate()`,
  НЕ через `toISOString()` (сдвиг на день в UTC+3) — это уже исправлялось
- **Анонимный auth + localStorage:** каждый вход создаёт анонимного auth-пользователя;
  профили учеников/преподавателей создаются админом/преподавателем заранее
- **Дубли `alert()` запрещены** — везде `showToast()`
- **Комментарии в коде не добавлять** (стиль проекта)
- Бандл >500 kB — предупреждение Vite, не критично (можно вынести code-splitting)

---

## 7. Идеи на следующий этап (не начато)

- [ ] Telegram-бот для автосообщений родителям (нужен токен бота + chat_id)
- [ ] Редактирование отдельных уроков внутри шаблона (сейчас — замена всего списка)
- [ ] Поиск по урокам/материалам
- [ ] Архив завершённых групп
- [ ] Статистика преподавателя (мини-дашборд: посещаемость по неделям)

---

## 8. Рабочий цикл

1. Изменения → `npm run build` (проверка TS+Vite)
2. `git add -A && git commit -m "feat|fix|refactor: ..."`
3. `git push origin main` → Vercel задеплоит автоматически (~30 сек)
4. Проверить на проде
