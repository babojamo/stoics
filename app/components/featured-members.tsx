"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { featuredMembers } from "./featured-members-data";

const carouselMembers = featuredMembers.slice(0, 10);

export function FeaturedMembers({ variant = "login" }: { variant?: "login" | "public" }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const pointerStart = useRef<number | null>(null);
  const show = useCallback((index: number) => setActive((index + carouselMembers.length) % carouselMembers.length), []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % carouselMembers.length), 6500);
    return () => window.clearInterval(timer);
  }, [paused]);

  const finishSwipe = (clientX: number) => {
    if (pointerStart.current === null) return;
    const distance = clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) < 45) return;
    show(active + (distance < 0 ? 1 : -1));
  };

  return <div className={`character-carousel ${variant === "public" ? "featured-members-public" : ""}`} aria-label="Featured Stoics members" onPointerEnter={() => setPaused(true)} onPointerLeave={() => { pointerStart.current = null; setPaused(false); }} onPointerDown={(event) => { pointerStart.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerUp={(event) => finishSwipe(event.clientX)} onPointerCancel={() => { pointerStart.current = null; }}>
    <div className="character-track" style={{ transform: `translateX(-${active * 100}%)` }}>
      {carouselMembers.map((member) => <figure className="character-slide" key={member.image}><img src={member.image} alt={`${member.name}, ${member.role}`} draggable={false} /></figure>)}
    </div>
    <div className="character-shade" />
    <div className="character-caption"><span>Featured member</span><strong>{carouselMembers[active].name}</strong><small>{carouselMembers[active].role}</small></div>
    <div className="character-controls">
      <button type="button" onClick={(event) => { event.stopPropagation(); show(active - 1); }} aria-label="Previous character"><ChevronLeft size={18} /></button>
      <div className="character-dots" aria-label="Choose featured character">{carouselMembers.map((member, index) => <button type="button" className={index === active ? "active" : ""} aria-label={`Show ${member.name}`} aria-current={index === active ? "true" : undefined} onClick={(event) => { event.stopPropagation(); show(index); }} key={member.name} />)}</div>
      <button type="button" onClick={(event) => { event.stopPropagation(); show(active + 1); }} aria-label="Next character"><ChevronRight size={18} /></button>
    </div>
  </div>;
}
