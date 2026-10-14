import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';

export function Button({ className = '', variant = 'primary', size = 'md', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' }) {
  return <button className={`btn btn-${variant} btn-${size} ${className}`} {...props} />;
}

export function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <section className={`card ${className}`} {...props}>{children}</section>;
}

export function Badge({ className = '', tone = 'neutral', children }: { className?: string; tone?: 'neutral' | 'green' | 'blue' | 'amber' | 'red' | 'purple'; children: ReactNode }) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return <div className={`progress ${className}`}><div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}
