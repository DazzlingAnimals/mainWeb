// loadingManager.js - 로딩 상태 통합 관리
// 무한 로딩 문제 해결을 위한 타임아웃 및 재시도 로직

const LOADING_TIMEOUTS = {
  contract: 10000,  // 10초
  wallet: 5000,     // 5초
  rpc: 8000         // 8초
};

const loadingState = {
  isLoading: false,
  phase: null,
  error: null,
  retryCount: 0,
  maxRetries: 3,
  lastUpdate: Date.now()
};

// 로딩 UI 엘리먼트
let statusBox = null;
let retryTimer = null;

// 초기화
export function initLoadingManager() {
  statusBox = document.getElementById('mintStatusBox');
  
  // 5초마다 로딩 상태 체크
  setInterval(checkStuckLoading, 5000);
  
  console.log('✅ Loading manager initialized');
}

// 로딩 시작
export function startLoading(phase, message) {
  loadingState.isLoading = true;
  loadingState.phase = phase;
  loadingState.error = null;
  loadingState.lastUpdate = Date.now();
  
  updateUI(message, false);
  
  // 타임아웃 설정
  const timeout = LOADING_TIMEOUTS[phase] || 10000;
  if (retryTimer) clearTimeout(retryTimer);
  
  retryTimer = setTimeout(() => {
    if (loadingState.isLoading && loadingState.phase === phase) {
      handleTimeout(phase);
    }
  }, timeout);
}

// 로딩 완료
export function finishLoading() {
  loadingState.isLoading = false;
  loadingState.phase = null;
  loadingState.error = null;
  loadingState.lastUpdate = Date.now();
  
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  
  // Status box 비우기
  if (statusBox) {
    statusBox.innerHTML = '';
  }
}

// 로딩 실패
export function failLoading(error, allowRetry = true) {
  loadingState.isLoading = false;
  loadingState.error = error;
  loadingState.lastUpdate = Date.now();
  
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  
  const canRetry = allowRetry && loadingState.retryCount < loadingState.maxRetries;
  updateUI(getErrorMessage(error), true, canRetry);
}

// 타임아웃 처리
function handleTimeout(phase) {
  console.error(`❌ Loading timeout: ${phase}`);
  loadingState.retryCount++;
  
  const message = `⏱️ Loading timeout (${phase}). Please check your connection.`;
  const canRetry = loadingState.retryCount < loadingState.maxRetries;
  
  updateUI(message, true, canRetry);
  
  // 자동 재시도
  if (canRetry) {
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  }
}

// 멈춘 로딩 감지
function checkStuckLoading() {
  if (!loadingState.isLoading) return;
  
  const elapsed = Date.now() - loadingState.lastUpdate;
  
  // 15초 이상 업데이트가 없으면 멈춘 것으로 간주
  if (elapsed > 15000) {
    console.warn('⚠️ Stuck loading detected');
    handleTimeout(loadingState.phase || 'unknown');
  }
}

// UI 업데이트
function updateUI(message, isError = false, showRetry = false) {
  if (!statusBox) return;
  
  const statusClass = isError ? 'mint__status--error' : 'mint__status--info';
  
  statusBox.innerHTML = `
    <div class="mint__status ${statusClass}">
      <div class="mint__statusIcon">
        ${isError ? 
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' : 
          '<div class="spinner"></div>'
        }
      </div>
      <div class="mint__statusText">${message}</div>
      ${showRetry ? `
        <button class="mint__retryBtn" onclick="window.location.reload()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          Retry (${loadingState.maxRetries - loadingState.retryCount})
        </button>
      ` : ''}
    </div>
  `;
}

// 에러 메시지 파싱
function getErrorMessage(error) {
  const msg = error?.message || error?.toString() || 'Unknown error';
  
  if (msg.includes('timeout')) {
    return '⏱️ Connection timeout. Please refresh and try again.';
  }
  if (msg.includes('user rejected') || msg.includes('User denied')) {
    return '❌ Transaction rejected by user.';
  }
  if (msg.includes('insufficient funds')) {
    return '💰 Insufficient funds for transaction.';
  }
  if (msg.includes('network') || msg.includes('NETWORK')) {
    return '🌐 Network error. Please check your RPC connection.';
  }
  if (msg.includes('contract')) {
    return '📜 Contract error. Please try again.';
  }
  
  return `❌ ${msg.slice(0, 100)}`;
}

// 현재 로딩 상태 반환
export function getLoadingState() {
  return { ...loadingState };
}

// 재시도 카운터 리셋
export function resetRetryCount() {
  loadingState.retryCount = 0;
}
