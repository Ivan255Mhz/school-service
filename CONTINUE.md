# School Service «Speak м.Купчино» — Handoff для работы с другого ПК

Документ для продолжения работы. Прочитай его целиком перед началом (для человека и для AI-агента в OpenCode).

---

## 1. Что это за проект

Веб-платформа управления школьной студией «Speak м.Купчино»:

- **Стек:** React 19 + TypeScript 6 + Vite 8 + Supabase (Postgres + Storage + Auth анонимная + Realtime + Edge Functions) + Vercel
- **Роли:** Ученик / Преподаватель / Админ (вход по кодам, роль хранится в localStorage)
- **Прод:** https://school-service-nine.vercel.app (автодеплой из ветки `main`)
- **Репозиторий:** https://github.com/Ivan255Mhz/school-service.git (ветка `main`)
- **Lint:** oxlint, baseline = **14 warnings / 0 errors** (не увеличивать)

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

# 4. Создать .env.local (в корне) — содержимое в разделе «Доступы» ниже

# 5. Запуск
npm run dev

# Сборка/проверка перед коммитом
npm run build
```

CLI-инструменты:
```bash
npm i -g supabase     # Edge Functions + секреты (v2.117+)
npm i -g vercel       # деплой (или правки через push в main)
```

Дома при первом `git push` нужно авторизоваться (git credential manager / `gh auth login`).

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

### Telegram-бот
- Токен бота хранится в **секретах Supabase**: `TELEGRAM_BOT_TOKEN` (задан ранее)
- Посмотреть/изменить: `supabase secrets list` / `supabase secrets set TELEGRAM_BOT_TOKEN=...`
- Сам токен бота можно посмотреть в Telegram у @BotFather → /mybots

### Быстрый вход через Яндекс ID (OAuth)
- Работает: привязка в шестерёнке профиля (ученик/преподаватель) → вход кнопкой «Войти через Яндекс ID»
- **VK убран по решению пользователя** (требовал ИП/организацию); колонка `profiles.vk_id` в БД осталась, не используется
- Секреты Supabase: `YANDEX_APP_ID`, `YANDEX_APP_SECRET` (приложение на oauth.yandex.ru)
- Redirect URI: `https://vduonltjzejrnnrujtkz.supabase.co/functions/v1/oauth` (зарегистрирован в приложении Яндекса)
- Edge Function `oauth` (задеплоена с `--no-verify-jwt` — колбэк приходит без JWT):
  `start` (URL авторизации) / `callback` (обмен кода + одноразовый токен) / `exchange` / `unlink`
- Вход работает только для уже привязанных аккаунтов; привязка требует код входа из сессии
  (teacher: login_code, student: invite_code из localStorage `student_invite_code`)
- Приложение Яндекса в черновике — авторизуются только владелец + тестовые пользователи;
  для публичного доступа — модерация в oauth.yandex.ru

### Supabase CLI / Management API
- CLI: `supabase login` (браузер) **или** `supabase login --token <sbp_...>`
- PAT-токен: https://supabase.com/dashboard/account/tokens (логин = GitHub)
- SQL без панели (PowerShell):
```powershell
$PAT = "sbp_..."
$headers = @{ "Authorization" = "Bearer $PAT"; "Content-Type" = "application/json" }
$body = '{ "query": "SELECT ..." }'
Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/vduonltjzejrnnrujtkz/database/query" -Method POST -Headers $headers -Body $body
```
> Это секрет — не коммитить, не публиковать.

**RLS:** во всех таблицах открытые политики (`FOR ALL USING (true)`). Auth — анонимная.
Правки «от чужого имени» (удаление фото, привязка чатов) делаются через Edge Function с service role.

### Storage buckets (public)
- `homework` — ДЗ учеников
- `lesson-materials` — материалы уроков
- `library` — книги/файлы библиотеки
- `avatars` — фото профиля (путь `${profile_id}/avatar`, upsert)

### Vercel
- Team `bm19`, проект `school-service`. Дома: `vercel login` (или правки через push — автодеплой из `main`).

---

## 4. Структура проекта

```
src/
  App.tsx                    маршруты (+ /material viewer, /admin gate)
  index.css                  все стили (тёмная тема + POLISH LAYER + MOBILE UX LAYER в конце)
  lib/supabase.ts            клиент + типы (Profile, Lesson, Group, Notification, ...)
  lib/materials.ts           materialHref/isHtmlUrl (HTML-материалы через /material)
  lib/avatar.ts              uploadAvatar / deleteAvatar (фото профиля)
  components/
    LoginScreen.tsx          вход ученик/преподаватель (+ плашка «Войти как администратор»)
    AdminGate.tsx            вход админа по URL /admin (сохраняет login_code в localStorage)
    AdminDashboard.tsx       Преподаватели / Расписание / Оплата / Библиотека
                             + привязка Telegram-чата ДИРЕКТОРА + удаление фото
    TeacherDashboard.tsx     Группы / Расписание / Шаблоны; в группе:
                             Ученики / Модули и уроки / ДЗ / Библиотека группы
                             + сводки в Telegram, отчёт директору
    StudentDashboard.tsx     Уроки / Расписание (календарь) / Библиотека
    NotificationBell.tsx     колокольчик + Realtime-подписка (все 3 дашборда)
    MaterialViewer.tsx       рендер HTML-материалов в sandbox iframe
    Toast.tsx                showToast('success'|'error'|'info', msg)
supabase/
  functions/send-telegram/   Edge Function (задеплоена в облако!)
  migrations/                SQL-миграции (ВСЕ выполнены в прод-БД)
```

### Таблицы Supabase
`profiles, groups, lessons, modules, attendance, homework, lesson_materials,
student_notes, library_items, module_templates, module_template_lessons,
notifications, app_settings`

Ключевые колонки:
- `groups.telegram_chat_id` — привязанный родительский чат группы
- `app_settings.key='director_chat_id'` — личный чат директора (короткий отчёт за день)
- `profiles.avatar_url` — фото профиля (преподаватель/ученик)
- `groups.price_per_lesson`, `groups.bonus_per_student` — цены **на группу**
- `lessons.date` — **nullable**, `lessons.is_completed`, `lessons.homework_description`

---

## 5. Что реализовано (всё на проде)

### Ядро (было до этого этапа)
- ✅ Вход по кодам STU-/TCH-/ADM-; группы, модули, уроки (сворачиваемые карточки,
  массовая расстановка дат, отметка всех присутствующих), календарь, шаблоны модулей
- ✅ Ученик: уроки, расписание, страница урока, ДЗ, заметки, библиотека
- ✅ Админ: преподаватели (цены по группам), расписание с фильтрами, оплата, библиотека

### Добавлено в этом этапе (сентябрь 2026)
- ✅ **Telegram-бот**: родительские чаты групп (привязка через getUpdates,
  поддерживаются и групповые, и личные чаты), отправка сводки завершённого урока
  кнопкой ✈ у урока (кнопка «копировать в буфер» и «клонировать урок» убраны
  по запросу пользователя)
- ✅ **Короткий отчёт директору за день**: дата + группа + кто был (кнопка в календаре),
  чат директора привязывается в админ-панели (вкладка «Преподаватели»)
- ✅ **Система уведомлений**: таблица notifications + Realtime (таблица добавлена
  в публикацию supabase_realtime), колокольчик с badge во всех дашбордах.
  События: сдано ДЗ (→ преподавателю + админам), урок завершён (→ ученикам группы),
  новый материал завершённого урока (→ ученикам)
- ✅ **Фото профиля**: аватарки преподавателя и ученика (клик — смена), фото видны
  в списках/посещаемости/ДЗ; админ удаляет любые фото (через Edge Function)
- ✅ **Фото модулей и шаблонов** (cover_url, бакет module-covers)
- ✅ **Настройки профиля** (шестерёнка в шапке): имя, аватар, привязка Яндекс ID
- ✅ **Быстрый вход через Яндекс ID** (OAuth, только Яндекс; VK убран)
- ✅ **UI-полировка**: шрифт Inter, градиентный фон, градиентные кнопки,
  сегментированные табы-пилюли, стеклянные карточки/логин, градиентные аватары,
  анимация-тумблер на чипах посещаемости
- ✅ **Мобильный UX**: хедер в одну строку, тач-цели 44px, скроллящиеся табы,
  действия урока отдельной строкой, инпуты 16px (без iOS-зума), safe-area
- ✅ **Палитра**: кислотные цвета заменены (мятный #34d399, роза #f43f5e)

### Инфраструктура
- Edge Function `send-telegram` — ACTIVE, verify_jwt=true. Действия:
  `send, bind, set_chat, get_director, bind_director, set_director_chat,
  send_director, delete_avatar`
- Edge Function `oauth` — ACTIVE, verify_jwt=**false**. Действия:
  `start, unlink, exchange` + GET callback
- Секреты: `TELEGRAM_BOT_TOKEN`, `YANDEX_APP_ID`, `YANDEX_APP_SECRET` заданы
- Все миграции из `supabase/migrations/` выполнены в прод-БД

---

## 6. Известные нюансы

- **Часовые пояса:** даты формировать через `getFullYear()/getMonth()/getDate()`,
  НЕ через `toISOString()` (сдвиг на день в UTC+3)
- **Кириллица в PowerShell:** НЕ добавлять текст с кириллицей в файлы через
  `Add-Content`/`Set-Content` в PS 5.1 — битая кодировка. Только ASCII или Edit-инструмент
- **RLS открытый по всему проекту** — консистентно, но знай: любые проверка прав
  с фронтенда формальные. Привилегированные действия — через Edge Function
  (проверка login_code роли + service role key)
- **notification realtime** — INSERT-события приходят мгновенно; при открытии
  дропдауна список перезагружается (страховка)
- **Дубли `alert()` запрещены** — везде `showToast()`
- **Комментарии в коде не добавлять** (стиль проекта)
- Бандл >500 kB — предупреждение Vite, не критично
- `api.telegram.org` недоступен с локального ПК напрямую (сетевые ограничения) —
  но Edge Function ходит в Telegram из облака Supabase, там всё работает

---

## 7. Идеи на следующий этап (не начато)

- [ ] Code-splitting (бандл 558 kB) — вынести дашборды в lazy-роуты
- [ ] Редактирование отдельных уроков внутри шаблона
- [ ] Поиск по урокам/материалам
- [ ] Архив завершённых групп
- [ ] Статистика преподавателя (посещаемость по неделям)
- [ ] Дублирование уведомлений в Telegram (опционально)
- [ ] Автоочистка старых notifications
- [ ] Ужесточение RLS (сейчас везде `USING (true)` — работает, но небезопасно при утечке ключей)

---

## 8. Рабочий цикл

1. Изменения → `npm run build` (проверка TS+Vite) + `npm run lint` (0 errors!)
2. `git add -A && git commit -m "feat|fix|refactor: ..."`
3. `git push origin main` → Vercel задеплоит автоматически (~30 сек)
4. Если менялся `supabase/functions/send-telegram`:
   `supabase functions deploy send-telegram --project-ref vduonltjzejrnnrujtkz`
5. Если менялся `supabase/functions/oauth`:
   `supabase functions deploy oauth --no-verify-jwt --project-ref vduonltjzejrnnrujtkz`
6. Если новая SQL-миграция: выполнить через Management API или SQL Editor,
   файл сохранить в `supabase/migrations/`
