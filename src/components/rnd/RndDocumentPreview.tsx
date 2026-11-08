import { useEffect, useRef, useState } from 'react';
import type { AdminWorkFormData } from '../../types';
import { RndRequestDocument } from './RndRequestDocument';

/** Scale the preview container, never the stored form or its A4 print geometry. */
export function RndDocumentPreview({ data }: { data: AdminWorkFormData }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, Math.max(.25, (element.clientWidth - 24) / (210 * 96 / 25.4)))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={host} className="rnd-preview-fit p-3"><div style={{ zoom: scale }}><RndRequestDocument data={data} /></div></div>;
}
