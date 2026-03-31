import React from 'react'
import card1 from '../assets/CARD1.png'
import card2 from '../assets/CARD2.png'
import card3 from '../assets/CARD3.png'
import card4 from '../assets/CARD4.png'

const TEAMS = [
  { label: '운영팀', image: card1 },
  { label: '교육팀', image: card2 },
  { label: '기획팀', image: card3 },
  { label: '홍보팀', image: card4 },
]

function TeamCards() {
  return (
    <section className="team-cards">
      {TEAMS.map((team) => (
        <div key={team.label} className="team-card">
          <img className="team-card-image" src={team.image} alt="" aria-hidden="true" />
          <div className="team-card-content">
            <span className="sr-only">{team.label}</span>
          </div>
        </div>
      ))}
    </section>
  )
}

export default TeamCards
