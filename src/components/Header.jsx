import React from 'react'
import logo from '../assets/logo.jpg'

function Header({ view, onNavigate }) {
  return (
    <header className="site-header">
      <div className="brand">
        <img className="brand-logo" src={logo} alt="GDG Sookmyung logo" />
        <span className="brand-title">Liar Game</span>
      </div>
      <nav className="nav">
        <button
          type="button"
          className={view === 'home' ? 'nav-link active' : 'nav-link'}
          onClick={() => onNavigate('home')}
        >
          홈
        </button>
        <button
          type="button"
          className={view === 'create' ? 'nav-link active' : 'nav-link'}
          onClick={() => onNavigate('create')}
        >
          방 만들기
        </button>
        <button
          type="button"
          className={view === 'how' ? 'nav-link active' : 'nav-link'}
          onClick={() => onNavigate('how')}
        >
          플레이 방법
        </button>
      </nav>
    </header>
  )
}

export default Header
