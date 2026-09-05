import { useState } from 'react'

interface Qr {
  key: string
  file: string
  label: string
}

// QR images live in public/ and are referenced by URL so a missing file just hides
// the card instead of breaking the build; drop donate-alipay.png in.
const channels: Qr[] = [
  { key: 'alipay', file: '/donate-alipay.png', label: '支付宝' }
]

function QrCard({ qr }: { qr: Qr }): React.JSX.Element | null {
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading')
  if (state === 'missing') return null
  return (
    <figure className="donate-qr">
      <div className="donate-qr-frame">
        {state === 'loading' && <span className="donate-qr-pending" aria-hidden="true" />}
        <img src={qr.file} alt={`${qr.label}收款码`} onLoad={() => setState('ready')} onError={() => setState('missing')} />
      </div>
      <figcaption>{qr.label}</figcaption>
    </figure>
  )
}

export function DonatePanel({ close }: { close: () => void }): React.JSX.Element {
  return <div className="overlay center" onClick={close}>
    <aside className="donate-card" role="dialog" aria-modal="true" aria-labelledby="donate-title" onClick={(event) => event.stopPropagation()}>
      <button className="donate-close" aria-label="关闭捐赠面板" onClick={close}>×</button>
      <span className="eyebrow">BUY ME A COFFEE</span>
      <h2 id="donate-title">请作者喝杯咖啡</h2>
      <p className="donate-text">如果墨隐阅读对你有帮助，欢迎扫码请作者喝杯咖啡 ☕</p>
      <div className="donate-qrs">
        {channels.map((qr) => <QrCard key={qr.key} qr={qr} />)}
      </div>
      <p className="settings-note">捐赠完全自愿，感谢每一份支持 ♥</p>
    </aside>
  </div>
}
