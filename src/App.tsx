import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { LoginScreen } from './components/LoginScreen'
import { StudentDashboard } from './components/StudentDashboard'
import { TeacherDashboard } from './components/TeacherDashboard'
import { AdminDashboard } from './components/AdminDashboard'
import { ToastContainer } from './components/Toast'

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: string }) {
  const userRole = localStorage.getItem('user_role')

  if (role === 'teacher' && userRole !== 'teacher') {
    return <Navigate to="/" replace />
  }
  if (role === 'student' && userRole !== 'student') {
    return <Navigate to="/" replace />
  }
  if (role === 'admin' && userRole !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route
          path="/student"
          element={
            <ProtectedRoute role="student">
              <StudentDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/teacher"
          element={
            <ProtectedRoute role="teacher">
              <TeacherDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
