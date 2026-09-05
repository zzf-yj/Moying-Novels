import qrImage from './assets/donate-alipay.png'

export function DonatePanel({ close }: { close: () => void }): React.JSX.Element {
  return <div className="overlay center" onClick={close}>
    <aside className="donate-card" role="dialog" aria-modal="true" aria-labelledby="donate-title" onClick={(event) => event.stopPropagation()}>
      <button className="donate-close" aria-label="关闭捐赠面板" onClick={close}>×</button>
      <span className="eyebrow">BUY ME A COFFEE</span>
      <h2 id="donate-title">请作者喝杯咖啡</h2>
      <p className="donate-text">如果墨隐阅读对你有帮助，欢迎扫码请作者喝杯咖啡 ☕</p>
      <div className="donate-qrs">
        <figure className="donate-qr">
          <div className="donate-qr-frame">
            <img src={qrImage} alt="支付宝收款码" />
          </div>
          <figcaption>支付宝</figcaption>
        </figure>
      </div>
      <p className="settings-note">捐赠完全自愿，感谢每一份支持 ♥</p>
    </aside>
  </div>
}
