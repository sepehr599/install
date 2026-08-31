import { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'

export function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="section"><div className="section-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>
}

export function Empty({ icon, title, text }: { icon?: ReactNode; title: string; text?: string }) {
  return <div className="empty"><div className="empty-icon">{icon}</div><strong>{title}</strong>{text && <span>{text}</span>}</div>
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="overlay"><div className={`modal ${wide ? 'modal-wide' : ''}`}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}>×</button></div>{children}</div></div>
}

export function RowLink({ title, meta, onClick }: { title: string; meta?: string; onClick: () => void }) {
  return <button className="row-link" onClick={onClick}><span><strong>{title}</strong>{meta && <small>{meta}</small>}</span><ChevronLeft size={18}/></button>
}
