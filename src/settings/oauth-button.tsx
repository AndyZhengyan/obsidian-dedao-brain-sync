import { useState, useCallback, useEffect } from 'preact/hooks';
import { fetchOAuthDeviceCode, pollOAuthToken } from '../api';
import { t } from '../i18n';

interface OAuthButtonProps {
  onAuthorize: (apiToken: string, clientId: string) => void;
  onSwitchToManual?: () => void;
}

type OAuthStep = 'idle' | 'opening' | 'code' | 'polling' | 'success' | 'error';

export function OAuthButton({ onAuthorize, onSwitchToManual }: OAuthButtonProps) {
  const [step, setStep] = useState<OAuthStep>('idle');
  const [userCode, setUserCode] = useState('');
  const [verificationUri, setVerificationUri] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [storedToken, setStoredToken] = useState<{ apiKey: string; clientId: string } | null>(null);

  const cancel = useCallback(() => {
    abortController?.abort();
    setStep('idle');
    setUserCode('');
    setVerificationUri('');
    setErrorMsg('');
  }, [abortController]);

  useEffect(() => () => { abortController?.abort(); }, [abortController]);

  const reset = () => {
    setStep('idle');
    setStoredToken(null);
    setUserCode('');
    setVerificationUri('');
    setErrorMsg('');
  };

  const handleAuthorize = async () => {
    const controller = new AbortController();
    setAbortController(controller);
    setErrorMsg('');

    try {
      // Step 1: get device code
      setStep('opening');
      const dc = await fetchOAuthDeviceCode(controller.signal);
      setUserCode(dc.user_code);
      setVerificationUri(dc.verification_uri);
      setStep('code');

      // Open verification page in system browser (avoids Electron focus issues)
      try {
        // @ts-ignore — Electron shell.openExternal via Obsidian
        const electron = (window as any).require?.('electron');
        if (electron?.shell) {
          electron.shell.openExternal(dc.verification_uri);
        } else {
          window.open(dc.verification_uri, '_blank');
        }
      } catch {
        window.open(dc.verification_uri, '_blank');
      }

      // Step 2: poll for token
      setStep('polling');
      const token = await pollOAuthToken(dc.code, dc.interval, controller.signal);
      setStoredToken({ apiKey: token.api_key, clientId: token.client_id });
      setStep('success');
      // Save credentials immediately
      onAuthorize(token.api_key, token.client_id);
      // After 2s, switch to manual mode so user can see filled inputs
      setTimeout(() => onSwitchToManual?.(), 2000);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStep('idle');
        return;
      }
      setStep('error');
      setErrorMsg(err instanceof Error ? err.message : t('oauth.error'));
    }
  };

  if (step === 'idle') {
    return (
      <div className="getnote-oauth-section">
        <button className="mod-cta" onClick={handleAuthorize}>
          {t('oauth.start')}
        </button>
      </div>
    );
  }

  if (step === 'opening') {
    return (
      <div className="getnote-oauth-section getnote-oauth-loading">
        <span>{t('oauth.pollWaiting')}</span>
        <button className="mod-cancel" onClick={cancel}>{t('picker.cancel')}</button>
      </div>
    );
  }

  if (step === 'code') {
    const openBrowser = () => {
      window.open(verificationUri, '_blank');
    };
    return (
      <div className="getnote-oauth-code-section">
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0' }}>
          {t('oauth.linkHint')}
        </p>
        <div className="getnote-oauth-code-box">
          <span className="getnote-oauth-code-label">{t('oauth.code')}</span>
          <span className="getnote-oauth-code-value">{userCode}</span>
          <button
            className="getnote-oauth-copy-btn"
            onClick={() => navigator.clipboard.writeText(userCode)}
          >
            {t('oauth.copyCode')}
          </button>
        </div>
        <div className="getnote-oauth-actions">
          <button className="mod-secondary" onClick={openBrowser}>{t('oauth.openBrowser')}</button>
          <button className="mod-cancel" onClick={cancel}>{t('picker.cancel')}</button>
        </div>
      </div>
    );
  }

  if (step === 'polling') {
    return (
      <div className="getnote-oauth-section getnote-oauth-loading">
        <span>{t('oauth.pollWaiting')}</span>
        <button className="mod-cancel" onClick={cancel}>{t('picker.cancel')}</button>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="getnote-oauth-section getnote-oauth-success">
        <span style={{ color: 'var(--text-success)', fontSize: '13px' }}>✓ {t('oauth.success')}</span>
        {storedToken && (
          <div className="getnote-oauth-credentials" style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <div>API Token: <code>{storedToken.apiKey}</code></div>
            <div>Client ID: <code>{storedToken.clientId}</code></div>
          </div>
        )}
        <button className="mod-secondary" onClick={reset} style={{ marginTop: '8px', fontSize: '12px' }}>
          {t('settings.authManual')}
        </button>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="getnote-oauth-section getnote-oauth-error">
        <span style={{ color: 'var(--text-error)', fontSize: '13px' }}>
          {t('oauth.error')}: {errorMsg}
        </span>
        <button className="mod-cancel" onClick={cancel}>{t('picker.cancel')}</button>
      </div>
    );
  }

  return null;
}