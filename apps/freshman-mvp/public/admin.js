const list = document.querySelector('#review-list');
const filter = document.querySelector('#status-filter');
const count = document.querySelector('#pending-count');
const template = document.querySelector('#review-template');

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function formatTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(value));
}

async function decide(id, status, finalAnswer, card) {
  for (const button of card.querySelectorAll('button')) button.disabled = true;
  try {
    const response = await fetch(`/api/reviews/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, finalAnswer, reviewerId: 'local-admin' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '审核失败');
    await loadReviews();
  } catch (error) {
    window.alert(error.message);
    for (const button of card.querySelectorAll('button')) button.disabled = false;
  }
}

function renderItem(item) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.review-card');
  fragment.querySelector('[data-role="ordinal"]').textContent = item.displayLabel;
  fragment.querySelector('[data-role="status"]').textContent = item.statusLabel;
  const risk = fragment.querySelector('[data-role="risk"]');
  risk.textContent = item.riskLevel === 'high' ? '高风险事实' : '普通';
  risk.dataset.risk = item.riskLevel;
  fragment.querySelector('[data-role="time"]').textContent = formatTime(item.createdAt);
  fragment.querySelector('[data-role="question"]').textContent = item.question;
  const answer = fragment.querySelector('[data-role="answer"]');
  answer.value = item.finalAnswer || item.answer;

  const sources = fragment.querySelector('[data-role="sources"]');
  for (const source of item.sources || []) {
    const sourceNode = source.url ? node('a', '', source.title) : node('span', '', source.title);
    if (source.url) {
      sourceNode.href = source.url;
      sourceNode.target = '_blank';
      sourceNode.rel = 'noreferrer';
    }
    sources.append(sourceNode);
  }

  const approve = fragment.querySelector('[data-action="approve"]');
  const reject = fragment.querySelector('[data-action="reject"]');
  if (item.status !== 'pending') {
    approve.hidden = true;
    reject.hidden = true;
    answer.disabled = true;
  } else {
    approve.addEventListener('click', () => decide(item.id, 'approved', answer.value, card));
    reject.addEventListener('click', () => decide(item.id, 'rejected', answer.value, card));
  }
  list.append(fragment);
}

async function loadReviews() {
  list.replaceChildren(node('div', 'loading-state', '正在读取审核队列…'));
  try {
    const query = filter.value ? `?status=${encodeURIComponent(filter.value)}` : '';
    const [response, pendingResponse] = await Promise.all([
      fetch(`/api/reviews${query}`),
      fetch('/api/reviews?status=pending'),
    ]);
    const data = await response.json();
    const pending = await pendingResponse.json();
    if (!response.ok) throw new Error(data.error || '读取失败');
    count.textContent = String(pending.items?.length || 0);
    list.replaceChildren();
    if (!data.items.length) {
      const empty = node('div', 'empty-state');
      empty.append(node('strong', '', '队列已经清空'));
      empty.append(node('p', '', '新的联网问题出现后，会按时间顺序排列在这里。'));
      list.append(empty);
      return;
    }
    for (const item of data.items) renderItem(item);
  } catch (error) {
    list.replaceChildren(node('div', 'error-card', error.message));
  }
}

filter.addEventListener('change', loadReviews);
loadReviews();
