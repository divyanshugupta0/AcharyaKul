const userLabel = document.getElementById('username');
const questionLabel = document.querySelector('.questionLoading');
const answerArea = document.getElementById('answerArea');
const profileImage = document.querySelector('.profile');
const popup = document.getElementById('popupOverlayFinish');
const finishExamButton = document.getElementById('endExam');
const confirmFinishButton = document.getElementById('confirmFinish');
const cancelFinishButton = document.getElementById('cancelFinish');
const previousButton = document.getElementById('prev');
const nextButton = document.getElementById('next');
const timerElement = document.querySelector('.timer');
const questionsGrid = document.getElementById('questionsGrid');

const pageUrl = new URL(window.location.href);
const pathnameParts = window.location.pathname.split('/').filter(Boolean);
const quizIdFromPath = pathnameParts[0] === 'exam' ? pathnameParts[1] || '' : '';
const quizId = pageUrl.searchParams.get('quizId') || quizIdFromPath;
const classId = pageUrl.searchParams.get('classId') || '';
const examMinutes = Number.parseInt(pageUrl.searchParams.get('duration') || '0', 10);
const currentUid = pageUrl.searchParams.get('firebaseUid') || '';
const AuthToken = pageUrl.searchParams.get('authtoken') || '';
const firebaseUid = `authtoken/${currentUid}`;

let sessionUser = null;
let quizzes = [];
let currentQuestionIndex = 0;
let warningCount = 0;
let examSubmitted = false;
let examTimerId = null;
let remainingSeconds = Number.isFinite(examMinutes) && examMinutes > 0 ? examMinutes * 60 : 0;
const answers = new Map();

function isQuizAvailableNow(quiz) {
    const now = Date.now();
    const startsAt = quiz && quiz.startsAt ? new Date(quiz.startsAt).getTime() : 0;
    const endsAt = quiz && quiz.endsAt ? new Date(quiz.endsAt).getTime() : 0;
    if (startsAt && now < startsAt) {
        return {
            available: false,
            message: `This exam starts at ${new Date(startsAt).toLocaleString()}.`
        };
    }
    if (endsAt && now > endsAt) {
        return {
            available: false,
            message: 'This exam window has already closed.'
        };
    }
    return { available: true, message: '' };
}

function clearQuestionSkeleton() {
    if (questionLabel) {
        questionLabel.classList.remove('questionLoading', 'loading');
        questionLabel.style.color = 'inherit';
    }
}

function showAlert(message) {
    const alertBox = document.createElement('div');
    const closeButton = document.createElement('button');

    alertBox.className = 'custom-alert';
    alertBox.textContent = message;

    closeButton.type = 'button';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => alertBox.remove());
    alertBox.appendChild(closeButton);
    document.body.appendChild(alertBox);

    Object.assign(alertBox.style, {
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#f44336',
        color: '#fff',
        padding: '15px',
        borderRadius: '5px',
        zIndex: '10000',
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    });

    Object.assign(closeButton.style, {
        border: 'none',
        borderRadius: '4px',
        padding: '6px 10px',
        cursor: 'pointer'
    });

    window.setTimeout(() => {
        if (document.body.contains(alertBox)) {
            alertBox.remove();
        }
    }, 4000);
}

function setLoadingState(message) {
    if (questionLabel) {
        questionLabel.textContent = message;
        questionLabel.classList.remove('loading');
        questionLabel.style.color = 'inherit';
    }
}

function formatTimer(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function updateTimerDisplay() {
    if (!timerElement) return;
    timerElement.innerHTML = formatTimer(Math.max(remainingSeconds, 0)).replace(/:/g, '<span class="time-colon">:</span>');
}

function startExamTimer() {
    if (!remainingSeconds || examTimerId) {
        updateTimerDisplay();
        return;
    }

    updateTimerDisplay();
    examTimerId = window.setInterval(() => {
        remainingSeconds -= 1;
        updateTimerDisplay();

        if (remainingSeconds <= 0) {
            window.clearInterval(examTimerId);
            examTimerId = null;
            showAlert('Time is up. Your exam is being submitted.');
            submitExam();
        }
    }, 1000);
}

function closePopup() {
    popup?.classList.remove('active');
}

function openPopup() {
    if (!quizzes.length) {
        showAlert('Questions are still loading. Please wait a moment.');
        return;
    }
    popup?.classList.add('active');
}

function redirectToResults(payload) {
    const params = new URLSearchParams();
    params.set('submitted', 'true');
    if (quizId) params.set('quizId', quizId);
    if (classId) params.set('classId', classId);
    if (payload && Number.isFinite(payload.score)) params.set('score', String(payload.score));
    if (payload && Number.isFinite(payload.total)) params.set('total', String(payload.total));
    window.location.href = `/student/?${params.toString()}`;
}

function updateQuestionGrid() {
    if (!questionsGrid) return;

    questionsGrid.innerHTML = '';
    quizzes.forEach((quiz, index) => {
        const box = document.createElement('button');
        box.type = 'button';
        box.className = 'qBox';
        box.textContent = String(index + 1);

        if (index === currentQuestionIndex) {
            box.style.backgroundColor = '#0f452a';
            box.style.color = '#fff';
        } else if (answers.has(quiz.id)) {
            box.style.backgroundColor = '#5fbf7a';
            box.style.color = '#0f452a';
        } else {
            box.style.backgroundColor = '#f1e3d6';
            box.style.color = '#0f452a';
            box.style.border = '1px solid #0f452a';
        }

        box.addEventListener('click', () => {
            currentQuestionIndex = index;
            renderCurrentQuestion();
        });
        questionsGrid.appendChild(box);
    });
}

function updateNavButtons() {
    if (previousButton) previousButton.disabled = currentQuestionIndex === 0;
    if (nextButton) nextButton.disabled = currentQuestionIndex >= quizzes.length - 1;
}

function getQuestionType(quiz) {
    return String(quiz && quiz.questionType ? quiz.questionType : 'radio').trim().toLowerCase() || 'radio';
}

function renderAnswerArea(quiz) {
    if (!answerArea || !quiz) return;
    const questionType = getQuestionType(quiz);
    const savedAnswer = answers.get(quiz.id);
    answerArea.innerHTML = '';

    if (questionType === 'radio' || questionType === 'checkbox') {
        const inputType = questionType === 'checkbox' ? 'checkbox' : 'radio';
        const savedValues = savedAnswer && Array.isArray(savedAnswer.answerValues)
            ? savedAnswer.answerValues.map((value) => String(value))
            : [];

        (Array.isArray(quiz.options) ? quiz.options : []).forEach((option, index) => {
            const label = document.createElement('label');
            label.className = 'option-card';
            const input = document.createElement('input');
            input.type = inputType;
            input.name = `quiz-${quiz.id}`;
            input.value = String(index);
            if (questionType === 'radio') {
                input.checked = Boolean(savedAnswer && Number(savedAnswer.answerIndex) === index);
            } else {
                input.checked = savedValues.includes(String(index));
            }
            input.addEventListener('change', () => {
                if (questionType === 'radio') {
                    answers.set(quiz.id, { answerIndex: index, answerText: '', answerValues: [] });
                } else {
                    const selected = Array.from(answerArea.querySelectorAll(`input[name="quiz-${quiz.id}"]:checked`))
                        .map((item) => item.value);
                    answers.set(quiz.id, { answerIndex: -1, answerText: '', answerValues: selected });
                }
                updateQuestionGrid();
            });
            const text = document.createElement('span');
            text.textContent = option || `Option ${index + 1}`;
            label.appendChild(input);
            label.appendChild(text);
            answerArea.appendChild(label);
        });
        return;
    }

    if (questionType === 'description' || questionType === 'coding') {
        const textarea = document.createElement('textarea');
        textarea.className = 'answerTextarea';
        textarea.placeholder = questionType === 'coding' ? 'Write your code answer here...' : 'Write your answer here...';
        textarea.value = savedAnswer && typeof savedAnswer.answerText === 'string' ? savedAnswer.answerText : '';
        textarea.addEventListener('input', () => {
            answers.set(quiz.id, { answerIndex: -1, answerText: textarea.value, answerValues: [] });
            updateQuestionGrid();
        });
        answerArea.appendChild(textarea);
        return;
    }

    const input = document.createElement('input');
    input.className = 'answerInput';
    input.type = questionType === 'number' ? 'number' : 'text';
    input.placeholder = questionType === 'number' ? 'Enter a number' : 'Enter your answer';
    input.value = savedAnswer && typeof savedAnswer.answerText === 'string' ? savedAnswer.answerText : '';
    input.addEventListener('input', () => {
        answers.set(quiz.id, { answerIndex: -1, answerText: input.value, answerValues: [] });
        updateQuestionGrid();
    });
    answerArea.appendChild(input);
}

function renderCurrentQuestion() {
    const currentQuiz = quizzes[currentQuestionIndex];
    if (!currentQuiz) return;

    clearQuestionSkeleton();

    if (questionLabel) {
        questionLabel.textContent = `${currentQuestionIndex + 1}. ${currentQuiz.question}`;
    }
    renderAnswerArea(currentQuiz);

    updateQuestionGrid();
    updateNavButtons();
}

function collectAnswers() {
    return quizzes
        .map((quiz) => {
            if (!answers.has(quiz.id)) {
                return null;
            }
            const answer = answers.get(quiz.id);
            if (answer && typeof answer === 'object' && !Array.isArray(answer)) {
                return { quizId: quiz.id, ...answer };
            }
            return { quizId: quiz.id, answerIndex: Number(answer) };
        })
        .filter(Boolean);
}

async function fetchJson(url, options) {
    return window.olmsAuth.fetchJson(url, options);
}

async function loadExamData() {
    const params = new URLSearchParams();
    if (quizId) {
        params.set('quizId', quizId);
    }
    if (classId) {
        params.set('classId', classId);
    }

    const endpoint = `/quizzes${params.toString() ? `?${params.toString()}` : ''}`;
    const payload = await fetchJson(endpoint);
    quizzes = Array.isArray(payload.quizzes) ? payload.quizzes : [];

    if (!quizzes.length) {
        setLoadingState('No questions were found for this exam.');
        if (finishExamButton) finishExamButton.disabled = true;
        return;
    }

    const unavailableQuiz = quizzes.find((quiz) => !isQuizAvailableNow(quiz).available);
    if (unavailableQuiz) {
        const availability = isQuizAvailableNow(unavailableQuiz);
        setLoadingState(availability.message || 'This exam is not available right now.');
        if (finishExamButton) finishExamButton.disabled = true;
        if (nextButton) nextButton.disabled = true;
        if (previousButton) previousButton.disabled = true;
        return;
    }

    if (!remainingSeconds && quizzes[0] && Number.isFinite(Number(quizzes[0].durationMinutes)) && Number(quizzes[0].durationMinutes) > 0) {
        remainingSeconds = Number(quizzes[0].durationMinutes) * 60;
    }

    renderCurrentQuestion();
    startExamTimer();
}

async function submitExam() {
    if (examSubmitted) {
        return;
    }

    const selectedAnswers = collectAnswers();
    if (!selectedAnswers.length) {
        showAlert('Please answer at least one question before finishing the exam.');
        return;
    }

    examSubmitted = true;
    confirmFinishButton.disabled = true;
    finishExamButton.disabled = true;
    nextButton.disabled = true;
    previousButton.disabled = true;

    try {
        const payload = await fetchJson('/submit-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: selectedAnswers })
        });

        closePopup();
        showAlert(`Exam submitted. Score: ${payload.score}/${payload.total}`);
        redirectToResults(payload);
    } catch (error) {
        examSubmitted = false;
        confirmFinishButton.disabled = false;
        finishExamButton.disabled = false;
        updateNavButtons();
        showAlert(error && error.message ? error.message : 'Unable to submit the exam. Please try again.');
    }
}

async function forceSubmit() {
    const selectedAnswers = collectAnswers();

    if (selectedAnswers.length === 0) {
        showAlert('No answers were selected. Submitting empty exam.');
    } else {
        showAlert('Submitting your exam due to suspicious activity.');
    }
    examSubmitted = true;
    confirmFinishButton.disabled = true;
    finishExamButton.disabled = true;
    nextButton.disabled = true;
    previousButton.disabled = true;

    try {
        const payload = await fetchJson('/submit-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: selectedAnswers })
        });

        closePopup();
        showAlert(`Exam submitted. Score: ${payload.score}/${payload.total}`);
        redirectToResults(payload);
    } catch (error) {
        examSubmitted = false;
        confirmFinishButton.disabled = false;
        finishExamButton.disabled = false;
        updateNavButtons();
        showAlert(error && error.message ? error.message : 'Unable to submit the exam. Please try again.');
    }
}

function markSuspiciousActivity() {
    warningCount += 1;
    if (warningCount >= 3) {
        showAlert('Too many suspicious activities detected. Your exam is being submitted.');
        submitExam();
        return;
    }

    showAlert('Suspicious activity detected. Please stay on the exam window.');
}

function hydrateUserPanel() {
    if (userLabel && sessionUser) {
        userLabel.textContent = sessionUser.displayName || sessionUser.email || 'Student';
    }

    if (profileImage && sessionUser && sessionUser.photoURL) {
        profileImage.src = sessionUser.photoURL;
        profileImage.classList.remove('loading');
    }
}

function bindEvents() {
    previousButton?.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex -= 1;
            renderCurrentQuestion();
        }
    });

    nextButton?.addEventListener('click', () => {
        if (currentQuestionIndex < quizzes.length - 1) {
            currentQuestionIndex += 1;
            renderCurrentQuestion();
        }
    });

    finishExamButton?.addEventListener('click', openPopup);
    cancelFinishButton?.addEventListener('click', closePopup);
    confirmFinishButton?.addEventListener('click', submitExam);

    popup?.addEventListener('click', (event) => {
        if (event.target === popup) {
            closePopup();
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (examSubmitted) {
            return;
        }
        event.preventDefault();
        event.returnValue = '';
    });

    window.addEventListener('keydown', (event) => {
        const key = String(event.key || '').toLowerCase();
        const triedRefresh = key === 'f5' || (event.ctrlKey && key === 'r');
        const triedDevTools = event.ctrlKey && event.shiftKey && key === 'i';
        const triedF12 = key === 'f12';

        if (triedRefresh) {
            event.preventDefault();
            showAlert('Page refresh is disabled during the exam.');
            updateTimerDisplay();
            return;
        }

        if (triedDevTools || triedF12) {
            event.preventDefault();
            markSuspiciousActivity();
        }
    });
}

async function bootstrap() {
    try {
        if (!window.olmsAuth) {
            throw new Error('Authentication client is not available.');
        }

        sessionUser = await window.olmsAuth.ensurePortalAccess(['student']);
        hydrateUserPanel();
        await loadExamData();
    } catch (error) {
        console.error('Failed to start exam:', error);
        setLoadingState('Unable to load exam data. Please sign in again.');
        showAlert(error && error.message ? error.message : 'Unable to load exam data.');
        if (window.olmsAuth && window.olmsAuth.isAccessLossError && window.olmsAuth.isAccessLossError(error)) {
            await window.olmsAuth.handleAccessLoss(error.message, '/exam/');
            return;
        }
    }
}

bindEvents();
updateTimerDisplay();
bootstrap();


function startExam() {
    if (verifyToken) {
        startExamTimer();
    }else{
        redirectBack();
    }
}

function verifyToken() {
    if (firebaseUid === AuthToken) {
        return true;
    }
    return false;
}

function redirectBack() {
    window.location.href = '/student/';
}
