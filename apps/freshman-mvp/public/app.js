const form = document.querySelector('#ask-form');
const questionInput = document.querySelector('#question');
const sendButton = document.querySelector('#send-button');
const feed = document.querySelector('#answer-feed');
const template = document.querySelector('#answer-template');

const routeLabels = {
  preset: '预设问题',
  collecting: '答案征集中',
  knowledge: '社区知识',
  web: '联网线索',
};

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderAnswer(question, data) {
  const fragment = template.content.cloneNode(true);
  const card = fragment.querySelector('.answer-card');
  fragment.querySelector('[data-role="question"]').textContent = question;
  const route = fragment.querySelector('[data-role="route"]');
  route.textContent = routeLabels[data.route] || data.route;
  route.dataset.route = data.route;
  fragment.querySelector('[data-role="mode"]').textContent = data.mode === 'demo' ? '演示模式' : '';
  fragment.querySelector('[data-role="answer"]').textContent = data.answer;

  const sourceList = fragment.querySelector('[data-role="sources"]');
  for (const source of data.sources || []) {
    const item = source.url
      ? node('a', 'source-chip', `来源 · ${source.title}`)
      : node('span', 'source-chip', `来源 · ${source.title}`);
    if (source.url) {
      item.href = source.url;
      item.target = '_blank';
      item.rel = 'noreferrer';
    }
    sourceList.append(item);
  }

  const disclaimer = fragment.querySelector('[data-role="disclaimer"]');
  if (data.disclaimer) {
    disclaimer.hidden = false;
    disclaimer.append(node('strong', '', '信息提示'));
    disclaimer.append(node('p', '', data.disclaimer));
  }
  feed.append(fragment);
  card?.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function renderError(message) {
  const card = node('article', 'error-card');
  card.append(node('strong', '', '请求没有成功'));
  card.append(node('p', '', message));
  feed.append(card);
}

async function ask(question) {
  sendButton.disabled = true;
  sendButton.querySelector('span').textContent = '思考中';
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '请稍后重试');
    renderAnswer(question, data);
  } catch (error) {
    renderError(error.message);
  } finally {
    sendButton.disabled = false;
    sendButton.querySelector('span').textContent = '发送';
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question) return;
  questionInput.value = '';
  questionInput.style.height = '';
  ask(question);
});

questionInput.addEventListener('input', () => {
  questionInput.style.height = 'auto';
  questionInput.style.height = `${Math.min(questionInput.scrollHeight, 120)}px`;
});

for (const button of document.querySelectorAll('[data-quick-question]')) {
  button.addEventListener('click', () => ask(button.dataset.quickQuestion));
}

document.querySelector('#clear-feed').addEventListener('click', () => {
  for (const card of feed.querySelectorAll('.answer-card,.error-card')) card.remove();
});
