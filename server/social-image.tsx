import 'server-only';
import { ImageResponse } from 'next/og';
import { socialImageSize } from '@/lib/social-metadata';

function shorten(text: string, limit: number) {
  const characters = Array.from(text.trim().replace(/\s+/g, ' '));
  return characters.length <= limit ? characters.join('') : characters.slice(0, limit - 1).join('').trimEnd() + '…';
}

export function renderSocialImage({ title, description, accent = '#E86D52', responses }: {
  title: string; description: string; accent?: string; responses?: number;
}) {
  return new ImageResponse(
    <div style={{ display: 'flex', width: '100%', height: '100%', background: '#F1EBE0', padding: '45px 53px', color: '#2A2623' }}>
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', borderRadius: 30, background: '#FFFDF9', border: '3px solid #2A2623', boxShadow: '10px 10px 0 #2A2623', overflow: 'hidden' }}>
        <div style={{ height: 16, width: '100%', background: accent, borderBottom: '3px solid #2A2623' }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '32px 46px 29px' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontWeight: 800, fontSize: 34 }}>Plyli<span style={{ color: '#B8452D' }}>.</span></div>
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.06, letterSpacing: -2, overflowWrap: 'anywhere' }}>{shorten(title, 83)}</div>
            {description && <div style={{ fontSize: 26, lineHeight: 1.25, color: '#655B53', overflowWrap: 'anywhere' }}>{shorten(description, 137)}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #D8CFC1', paddingTop: 19, fontSize: 21 }}>
            <span style={{ display: 'flex', background: '#F6D97A', borderRadius: 8, padding: '7px 14px', fontWeight: 700 }}>{responses === undefined ? 'Open-source form builder' : `${responses.toLocaleString('en')} ${responses === 1 ? 'response' : 'responses'}`}</span>
          </div>
        </div>
      </div>
    </div>,
    { ...socialImageSize, headers: { 'Cache-Control': responses === undefined ? 'public, max-age=3600' : 'no-store' } },
  );
}
