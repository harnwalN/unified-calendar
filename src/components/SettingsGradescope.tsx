import Icon from './Icon';
import './Settings.css';
import './SettingsSources.css';

const CHROME = 'https://chromewebstore.google.com/detail/bbepekfgnpdfclkpfoojmfclnbkkbbco';
const FIREFOX = 'https://addons.mozilla.org/firefox/addon/gradescope-to-cal/';

/** Settings → Gradescope: deadlines arrive through Google Calendar via the Gradescope to Cal extension. */
export default function SettingsGradescope() {
  return (
    <div className="s-stack">
      <ol className="s-steps">
        <li>
          <span>
            Install the free <b>Gradescope to Cal</b> browser extension.
            <span className="src-links">
              <a className="s-btn s-btn--outlined s-btn--small" href={CHROME} target="_blank" rel="noreferrer">
                <Icon name="open_in_new" /> Chrome / Edge
              </a>
              <a className="s-btn s-btn--outlined s-btn--small" href={FIREFOX} target="_blank" rel="noreferrer">
                <Icon name="open_in_new" /> Firefox
              </a>
            </span>
          </span>
        </li>
        <li>
          <span>
            Open <b>gradescope.com</b>, click the extension and let it add your deadlines to a Google Calendar of an
            account you’ve connected here.
          </span>
        </li>
        <li>
          <span>
            That’s it — events from a calendar with “Gradescope” in its name, or with a gradescope.com link, show up here
            as assignments under their class. Run the extension again whenever new assignments are posted.
          </span>
        </li>
      </ol>
      <div className="s-note">
        <Icon name="info" />
        <span>The extension is made by a third party; Unified Calendar only reads the events it creates.</span>
      </div>
    </div>
  );
}
