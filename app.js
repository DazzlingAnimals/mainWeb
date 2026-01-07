// app.js - 통합 초기화 관리자
// 모든 비동기 초기화를 순서대로 관리하고 타임아웃 처리

const APP_STATE = {
  walletReady: false,
  contractReady: false,
  uiReady: false,
  initError: null,
  retryCount: 0,
  maxRetries: 3
};

const TIMEOUTS = {
  walletInit: 5000,       // 5초
  contractInit: 8000,    // 8초
  rpcCall: 8000           // 8초
};

// 타임아웃이 있는 Promise 래퍼
function withTimeout(promise, ms, errorMsg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg || `Timeout after ${ms}ms`)), ms)
    )
  ]);
}

// 로딩 상태 UI 업데이트
function updateLoadingUI(message, isError = false) {
  const statusBox = document.getElementById('mintStatusBox');
  if (!statusBox) return;
  
  const statusClass = isError ? 'mint__status--error' : 'mint__status--info';
  statusBox.innerHTML = `
    <div class="mint__status ${statusClass}">
      <div class="mint__statusIcon">
        ${isError ? 
          '<i data-lucide="alert-circle"></i>' : 
          '<div class="spinner"></div>'
        }
      </div>
      <div class="mint__statusText">${message}</div>
      ${isError ? `
        <button class="mint__retryBtn" onclick="window.retryInitialization()">
          <i data-lucide="refresh-cw"></i> Retry
        </button>
      ` : ''}
    </div>
  `;
  
  if (window.lucide) window.lucide.createIcons();
}

// 초기화 재시도
window.retryInitialization = async function() {
  if (APP_STATE.retryCount >= APP_STATE.maxRetries) {
    updateLoadingUI('⚠️ The maximum number of retries has been reached. Please refresh the page and note the following:<br> 1. Make sure a Web3 wallet is installed on your browser.<br> 2. Connect the wallet first.<br> 3. Brave or Google Chrome are recommended browsers for this dApp.', true);
    return;
  }
  
  APP_STATE.retryCount++;
  updateLoadingUI(`🔄 Retrying initialization (${APP_STATE.retryCount}/${APP_STATE.maxRetries})...`);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  await initializeApp();
};

// 메인 초기화 함수
export async function initializeApp() {
  console.log('🚀 Starting app initialization...');
  
  try {
    // 1단계: Contract 설정 검증
    updateLoadingUI('📜 Verifying contract configuration...');
    const { CONTRACT_ADDRESS } = await import('./contract.js');
    
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
      throw new Error('Contract address not configured');
    }
    
    APP_STATE.contractReady = true;
    console.log('✅ Contract configuration verified');
    
    // 2단계: Mint 초기화 (wallet + UI 포함)
    updateLoadingUI('Loading contract data... <br> 1. Make sure a Web3 wallet is installed on your browser.<br> 2. Connect the wallet first.<br> 3. Brave or Google Chrome are recommended browsers for this dApp.');
    const { initMint } = await import('./mint.js');
    
    await withTimeout(
      initMint(),
      TIMEOUTS.contractInit,
      'Application initialization timeout'
    );
    
    APP_STATE.walletReady = true;
    APP_STATE.uiReady = true;
    console.log('✅ Application initialized');
    
    // 초기화 완료
    APP_STATE.initError = null;
    APP_STATE.retryCount = 0;
    
    // mintStatusBox는 mint.js의 refreshAndRender가 관리하므로 여기서 비우지 않음
    
    console.log('🎉 App initialization complete');
    
    // 초기화 완료 이벤트 발생
    window.dispatchEvent(new CustomEvent('app:initialized'));
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    APP_STATE.initError = error;
    
    const errorMsg = getErrorMessage(error);
    updateLoadingUI(`❌ ${errorMsg}`, true);
    
    // 자동 재시도 (최대 횟수 미만일 때)
    if (APP_STATE.retryCount < APP_STATE.maxRetries) {
      setTimeout(() => {
        window.retryInitialization();
      }, 3000);
    }
  }
}

// 에러 메시지 파싱
function getErrorMessage(error) {
  const message = error?.message || error?.toString() || 'Unknown error';
  
  if (message.includes('timeout')) {
    return 'Connection timeout. Please check your network.';
  }
  if (message.includes('MetaMask') || message.includes('wallet')) {
    return 'Wallet connection failed. Please install MetaMask.';
  }
  if (message.includes('network') || message.includes('chain')) {
    return 'Network error. Please check your RPC connection.';
  }
  if (message.includes('contract')) {
    return 'Contract loading failed. Please try again.';
  }
  
  return `Initialization failed: ${message}`;
}

// 앱 상태 조회
export function getAppState() {
  return { ...APP_STATE };
}

// DOMContentLoaded에서 자동 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
