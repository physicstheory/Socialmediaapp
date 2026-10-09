import { api } from '../api.js';
import { h, logo, modal, toast } from '../ui.js';

/** First-launch popup: Sign in or Create account. */
export function showAuth(onDone) {
  let close = null;
  const body = h('div', { class: 'auth' });
  const show = (fn) => body.replaceChildren(fn());

  const welcome = () => h('div', { class: 'col gap center' },
    logo(72),
    h('h2', {}, 'Welcome to Ember'),
    h('p', { class: 'muted' }, 'Videos from your friends first. Messaging that’s built to be safe.'),
    h('button', { class: 'btn primary block', onclick: () => show(signup) }, 'Create account'),
    h('button', { class: 'btn ghost block', onclick: () => show(signin) }, 'Sign in'),
    h('p', { class: 'tiny muted' }, 'By continuing you agree to keep Ember kind and safe for everyone.'));

  const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
  const errBox = () => h('p', { class: 'form-error', role: 'alert' });

  async function submit(e, path, getBody, err, btn) {
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true;
    try {
      const { user } = await api(path, { method: 'POST', body: getBody() });
      close();
      onDone(user);
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  }

  const signin = () => {
    const u = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', required: true, placeholder: 'username' });
    const p = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true, placeholder: 'password' });
    const err = errBox();
    const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Sign in');
    return h('form', { class: 'col gap', onsubmit: (e) => submit(e, '/auth/login', () => ({ username: u.value, password: p.value }), err, btn) },
      h('h2', { class: 'center' }, 'Sign in'),
      field('Username', u), field('Password', p), err, btn,
      h('button', { type: 'button', class: 'link-btn', onclick: () => show(signup) }, 'New here? Create an account'));
  };

  const signup = () => {
    const u = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', required: true, minlength: '3', maxlength: '20', pattern: '[A-Za-z0-9_.]{3,20}', placeholder: 'e.g. sunny.days' });
    const d = h('input', { class: 'input', maxlength: '30', placeholder: 'Your name (shown to friends)' });
    const b = h('input', { class: 'input', type: 'date', required: true, max: new Date().toISOString().slice(0, 10) });
    const p = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minlength: '8', placeholder: 'At least 8 characters' });
    const err = errBox();
    const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Create account');
    return h('form', { class: 'col gap', onsubmit: (e) => submit(e, '/auth/signup', () => ({ username: u.value, displayName: d.value, birthdate: b.value, password: p.value }), err, btn) },
      h('h2', { class: 'center' }, 'Create account'),
      field('Username', u),
      field('Display name', d),
      field('Birthday', b),
      h('p', { class: 'tiny muted' }, 'Your birthday sets up age-appropriate protections automatically. It’s never shown to anyone.'),
      field('Password', p),
      err, btn,
      h('button', { type: 'button', class: 'link-btn', onclick: () => show(signin) }, 'Already have an account? Sign in'));
  };

  show(welcome);
  close = modal(body, { dismissable: false, cls: 'auth-modal' });
  if (!navigator.onLine) toast("You're offline.", 'error');
}
