import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import IndexPage from './pages/index/index'
import DetailPage from './pages/detail/index'
import TrendsPage from './pages/trends/index'
import FuturePage from './pages/future/index'
import ProjectionPage from './pages/projection/index'
import MePage from './pages/me/index'
import NavBar from './NavBar'

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<IndexPage />} />
        <Route path="/detail/:id" element={<DetailPage />} />
        <Route path="/trends" element={<TrendsPage />} />
        <Route path="/future" element={<FuturePage />} />
        <Route path="/projection/:id" element={<ProjectionPage />} />
        <Route path="/me" element={<MePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <NavBar />
    </ThemeProvider>
  )
}
