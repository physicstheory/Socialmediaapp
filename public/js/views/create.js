import { api, state } from '../api.js';
import { h, icon, toast } from '../ui.js';
import { navigate } from '../app.js';
import { INTERESTS } from './settingsForm.js';

export function renderCreate(view) {
  const user = state.user;
  let mode = 'tiktok';
  let file = null;
  let previewUrl = null;

  const caption = h('textarea', { class: 'input', rows: '3', maxlength: '300', placeholder: 'Describe your video… #hashtags help friends find it' });
  const counter = h('span', { class: 'tiny muted' }, '0/300');
  caption.addEventListener('input', () => { counter.textContent = `${caption.value.length}/300`; });
  const category = h('select', { class: 'input' }, h('option', { value: '' }, 'Auto-detect topic'),
    Object.entries(INTERESTS).map(([k, v]) => h('option', { value: k }, v)));
  const label = h('select', { class: 'input' },
    h('option', { value: 'everyone' }, 'Suitable for everyone'),
    user.ageGroup !== 'kid' ? h('option', { value: 'teen' }, 'Teen 13+') : null,
    user.ageGroup === 'adult' ? h('option', { value: 'mature' }, 'Mature 18+') : null);

  const url = h('input', { class: 'input', type: 'url', inputmode: 'url', placeholder: 'https://www.tiktok.com/@user/video/…' });
  const fileInput = h('input', { type: 'file', accept: 'video/mp4,video/webm,video/quicktime', hidden: true });
  const preview = h('div', { class: 'upload-drop', onclick: () => fileInput.click() }, icon('upload', { size: 36 }), h('span', {}, 'Tap to choose a video'), h('span', { class: 'tiny muted' }, 'MP4, MOV or WebM · up to 60 MB'));
  fileInput.addEventListener('change', () => {
    file = fileInput.files[0] || null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!file) return;
    previewUrl = URL.createObjectURL(file);
    preview.replaceChildren(h('video', { src: previewUrl, muted: true, autoplay: true, loop: true, playsinline: true }));
  });

  const sourceBox = h('div');
  const tabs = h('div', { class: 'segmented' });
  const drawMode = () => {
    tabs.replaceChildren(
      h('button', { type: 'button', class: mode === 'tiktok' ? 'on' : '', onclick: () => { mode = 'tiktok'; drawMode(); } }, 'Share a TikTok'),
      h('button', { type: 'button', class: mode === 'upload' ? 'on' : '', onclick: () => { mode = 'upload'; drawMode(); } }, 'Upload video'));
    sourceBox.replaceChildren(mode === 'tiktok'
      ? h('label', { class: 'field' }, h('span', {}, 'TikTok link'), url, h('span', { class: 'tiny muted' }, 'In TikTok tap Share → Copy link. The video plays from TikTok’s servers in their official player.'))
      : h('div', {}, preview, fileInput));
  };
  drawMode();

  const postBtn = h('button', { class: 'btn primary block', type: 'submit' }, 'Post to friends');
  const form = h('form', {
    class: 'col gap',
    onsubmit: async (e) => {
      e.preventDefault();
      postBtn.disabled = true;
      postBtn.textContent = 'Checking & posting…';
      try {
        let res;
        if (mode === 'tiktok') {
          res = await api('/posts', { method: 'POST', body: { url: url.value, caption: caption.value, category: category.value, selfLabel: label.value } });
        } else {
          if (!file) throw new Error('Choose a video first.');
          res = await api('/posts/upload', {
            method: 'POST', raw: file, contentType: file.type || 'video/mp4',
            query: { caption: caption.value, category: category.value, selfLabel: label.value },
          });
        }
        toast(res.notice || 'Posted! Your friends will see it in Following 🔥');
        navigate('profile');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        postBtn.disabled = false;
        postBtn.textContent = 'Post to friends';
      }
    },
  },
  tabs, sourceBox,
  h('label', { class: 'field' }, h('span', { class: 'row between' }, 'Caption', counter), caption),
  h('div', { class: 'row gap' }, h('label', { class: 'field grow' }, h('span', {}, 'Topic'), category), h('label', { class: 'field grow' }, h('span', {}, 'Audience'), label)),
  h('p', { class: 'tiny muted' }, icon('shield', { size: 12 }), ' Every post is automatically checked. Harmful content is blocked and each video gets an age rating so it only reaches the right audience.'),
  postBtn);

  view.append(h('div', { class: 'page' },
    h('header', { class: 'page-head' },
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => history.back() }, icon('close')),
      h('h1', {}, 'New post'), h('span', { class: 'icon-btn' })),
    form));
  return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
}
