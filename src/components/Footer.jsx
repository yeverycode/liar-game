import React from 'react'
import githubIcon from '../assets/github_icon.png'
import instaIcon from '../assets/insta_Icon.png'
import siteIcon from '../assets/site_icon.png'
import youtubeIcon from '../assets/youtube_icon.png'
import tistoryIcon from '../assets/tistory_icon.png'

const SOCIALS = [
  { label: 'GitHub', icon: githubIcon, href: 'https://github.com/dsc-sookmyung' },
  {
    label: 'Site',
    icon: siteIcon,
    href: 'https://gdg.community.dev/gdg-on-campus-sookmyung-womens-university-seoul-south-korea/',
  },
  { label: 'Instagram', icon: instaIcon, href: 'https://www.instagram.com/gdg_sookmyung/' },
  { label: 'YouTube', icon: youtubeIcon, href: 'https://www.youtube.com/@gdgocsookmyung' },
  { label: 'Tistory', icon: tistoryIcon, href: 'https://dsc-sookmyung.tistory.com/' },
]

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-title">
        <span className="footer-dot" aria-hidden="true" />
        <span>GDGoC Sookmyung</span>
      </div>
      <div className="footer-icons">
        {SOCIALS.map((item) => (
          <a
            key={item.label}
            className="footer-icon"
            href={item.href}
            target={item.href.startsWith('http') ? '_blank' : undefined}
            rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
            aria-label={item.label}
          >
            <img src={item.icon} alt="" className="footer-icon-img" />
          </a>
        ))}
      </div>
    </footer>
  )
}

export default Footer
