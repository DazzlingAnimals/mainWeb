// wallet.js (ESM)

const { ethers } = window;

import { TARGET_CHAIN, shortAddr } from "./contract.js";

const state = {
  provider: null,
  signer: null,
  address: null,
  chainId: null,
  connected: false,
  isCorrectNetwork: false,
};

const listeners = new Set();

export function onWalletStateChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn({ ...state });
}

function $id(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = $id(id);
  if (el) el.textContent = text;
}

function setHTML(id, html) {
  const el = $id(id);
  if (el) el.innerHTML = html;
}

function log(line) {
  const box = $id("logBox");
  if (!box) return;
  const now = new Date().toISOString().split("T")[1].split(".")[0];
  box.textContent = `[${now}] ${line}\n` + box.textContent;
}

async function ensureEthereum() {
  if (!window.ethereum) {
    showMetaMaskModal();
    throw new Error("MetaMask not installed");
  }
}

function showMetaMaskModal() {
  const modal = document.createElement('div');
  modal.className = 'error-modal';
  modal.innerHTML = `
    <div class="error-modal__overlay"></div>
    <div class="error-modal__panel">
      <div class="error-modal__icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>
      <h3 class="error-modal__title">MetaMask Not Found</h3>
      <p class="error-modal__message">Please install MetaMask to connect your wallet and mint NFTs.</p>
      <div class="error-modal__actions">
        <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" class="error-modal__btn error-modal__btn--primary">
          Install MetaMask
        </a>
        <button class="error-modal__btn error-modal__btn--secondary" type="button">Close</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const closeBtn = modal.querySelector('.error-modal__btn--secondary');
  const overlay = modal.querySelector('.error-modal__overlay');
  
  const close = () => modal.remove();
  
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  
  requestAnimationFrame(() => modal.classList.add('show'));
}

async function getChainId() {
  const hex = await window.ethereum.request({ method: "eth_chainId" });
  return Number.parseInt(hex, 16);
}

async function switchOrAddChain() {
  const desiredHex = TARGET_CHAIN.chainIdHex;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: desiredHex }],
    });
  } catch (err) {
    if (err?.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: desiredHex,
            chainName: TARGET_CHAIN.name,
            rpcUrls: TARGET_CHAIN.rpcUrls,
            blockExplorerUrls: TARGET_CHAIN.blockExplorerUrls,
            nativeCurrency: TARGET_CHAIN.nativeCurrency,
          },
        ],
      });
      return;
    }
    throw err;
  }
}

async function refreshAccountAndNetwork() {
  // MetaMask 없으면 조용히 종료
  if (!window.ethereum) {
    state.provider = null;
    state.signer = null;
    state.address = null;
    state.connected = false;
    state.isCorrectNetwork = false;
    emit();
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum, "any");
  const chainId = await getChainId();

  state.provider = provider;
  state.chainId = chainId;
  state.isCorrectNetwork = chainId === TARGET_CHAIN.chainId;

  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  if (!accounts || accounts.length === 0) {
    state.signer = null;
    state.address = null;
    state.connected = false;
    state.isCorrectNetwork = false;
    emit();
    return;
  }

  state.signer = await provider.getSigner();
  state.address = accounts[0];
  state.connected = true;
  emit();
}

export function disconnectWallet() {
  state.provider = null;
  state.signer = null;
  state.address = null;
  state.connected = false;
  emit();
  renderWalletButton();
  log("✅ Wallet disconnected");
}

export async function initWalletUI() {
  const btn = $id("connectBtn");
  const mobileBtn = $id("walletMobileBtn");
  
  // 데스크톱 버튼
  if (btn) {
    btn.addEventListener("click", async (e) => {
      if (!state.connected) {
        try {
          await connectWallet();
        } catch (err) {
          log(`❌ Wallet connection failed: ${err?.message || err}`);
        }
      } else {
        toggleDropdown();
      }
    });
  }

  // 🔥 모바일 버튼
  if (mobileBtn) {
    mobileBtn.addEventListener("click", async (e) => {
      if (!state.connected) {
        try {
          await connectWallet();
        } catch (err) {
          log(`❌ Wallet connection failed: ${err?.message || err}`);
        }
      }
    });
  }

  // 🔥 모바일 Copy 버튼
  const copyMobileBtn = $id("copyMobileBtn");
  if (copyMobileBtn) {
    copyMobileBtn.addEventListener("click", async () => {
      if (!state.address) return;
      try {
        await navigator.clipboard.writeText(state.address);
        const span = copyMobileBtn.querySelector("span");
        const originalText = span.textContent;
        span.textContent = "Copied!";
        setTimeout(() => {
          span.textContent = originalText;
        }, 1500);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    });
  }
  // MetaMask 없어도 진행 (에러 무시)
  try {
    if (window.ethereum) {
      await refreshAccountAndNetwork();
    }
  } catch (e) {
    console.log("Wallet not connected");
  }
  renderWalletButton();


  if (window.ethereum?.on) {
    window.ethereum.on("accountsChanged", async () => {
      await refreshAccountAndNetwork();
      renderWalletButton();
      log("🔄 Account changed");
    });

    window.ethereum.on("chainChanged", async () => {
      await refreshAccountAndNetwork();
      renderWalletButton();
      log("🔄 Network changed");
    });
  }

  onWalletStateChange(renderWalletButton);
  
  document.addEventListener("click", (e) => {
    const walletSlot = document.querySelector(".wallet-slot");
    if (walletSlot && !walletSlot.contains(e.target)) {
      closeDropdown();
    }
  });

}

export async function connectWallet() {
  await ensureEthereum();
  await window.ethereum.request({ method: "eth_requestAccounts" });

  const chainId = await getChainId();
  if (chainId !== TARGET_CHAIN.chainId) {
    await switchOrAddChain();
  }

  await refreshAccountAndNetwork();
  renderWalletButton();
  log("✅ Wallet connected");
}

export function getWalletState() {
  return { ...state };
}

export async function getNativeBalance() {
  if (!state.provider || !state.address) return "0.0";
  const bal = await state.provider.getBalance(state.address);
  return ethers.formatEther(bal);
}

function toggleDropdown() {
  const dropdown = $id("walletDropdown");
  if (!dropdown) return;
  
  const isHidden = dropdown.classList.contains("hidden");
  if (isHidden) {
    dropdown.classList.remove("hidden");
    setTimeout(() => dropdown.classList.add("show"), 10);
  } else {
    closeDropdown();
  }
}

function closeDropdown() {
  const dropdown = $id("walletDropdown");
  if (!dropdown) return;
  
  dropdown.classList.remove("show");
  setTimeout(() => dropdown.classList.add("hidden"), 200);
}

async function renderWalletButton() {
  const { connected, address, chainId, isCorrectNetwork } = state;
  const btn = $id("connectBtn");
  
  if (!btn) return;

  // 🔥 데스크톱 UI 업데이트
  if (!connected) {
    btn.innerHTML = `
      <span class="nav__walletBtnIcon" aria-hidden="true">
        <i data-lucide="wallet"></i>
      </span>
      <span class="nav__walletBtnText">Connect Wallet</span>
    `;
    
    const dropdown = $id("walletDropdown");
    if (dropdown) dropdown.classList.add("hidden");
    
  } else {
    if (!isCorrectNetwork) {
      btn.innerHTML = `
        <span class="nav__walletBtnIcon" aria-hidden="true">
          <i data-lucide="alert-triangle"></i>
        </span>
        <div class="nav__walletBtnInfo">
          <span class="nav__walletBtnAddress">${shortAddr(address)}</span>
          <span class="nav__walletBtnBalance">Wrong Network</span>
        </div>
        <span class="nav__walletBtnChevron" aria-hidden="true">
          <i data-lucide="chevron-down"></i>
        </span>
      `;
      updateDropdown(address, chainId);
      updateMobileWallet(address, null, chainId);
      try { window.lucide && window.lucide.createIcons(); } catch {}
      return;
    }

    try {
      const balance = await getNativeBalance();
      const balanceFormatted = Number(balance).toFixed(4);
      
      btn.innerHTML = `
        <span class="nav__walletBtnIcon" aria-hidden="true">
          <i data-lucide="wallet"></i>
        </span>
        <div class="nav__walletBtnContent">
          <span class="nav__walletBtnAddress">${shortAddr(address)}</span>
          <span class="nav__walletBtnBalance">${balanceFormatted} ${TARGET_CHAIN.nativeCurrency.symbol}</span>
        </div>
        <span class="nav__walletBtnChevron" aria-hidden="true">
          <i data-lucide="chevron-down"></i>
        </span>
      `;
      
      updateDropdown(address, chainId);
      updateMobileWallet(address, balance, chainId);
      
    } catch (err) {
      console.error("Balance fetch failed:", err);
      btn.innerHTML = `
        <span class="nav__walletBtnIcon" aria-hidden="true">
          <i data-lucide="wallet"></i>
        </span>
        <span class="nav__walletBtnText">${shortAddr(address)}</span>
        <span class="nav__walletBtnChevron" aria-hidden="true">
          <i data-lucide="chevron-down"></i>
        </span>
      `;
      updateDropdown(address, chainId);
      updateMobileWallet(address, null, chainId);
    }
  }

  // 🔥 모바일 UI 업데이트 (미연결 시)
  if (!connected) {
    updateMobileWallet(null, null, null);
  }
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// 🔥 모바일 지갑 UI 업데이트 함수
function updateMobileWallet(address, balance, chainId) {
  const mobileBtn = $id("walletMobileBtn");
  const mobileInfo = $id("walletMobileInfo");
  
  if (!mobileBtn || !mobileInfo) return;
  
  if (!address) {
    // 미연결 상태
    mobileBtn.classList.remove("hidden");
    mobileInfo.classList.add("hidden");
    mobileBtn.innerHTML = `
      <span class="mobileMenu__walletIcon">
        <i data-lucide="wallet"></i>
      </span>
      <span class="mobileMenu__walletText">Connect Wallet</span>
    `;
  } else {
    // 연결 상태
    mobileBtn.classList.add("hidden");
    mobileInfo.classList.remove("hidden");
    
    const balanceText = balance 
      ? `${Number(balance).toFixed(4)} ${TARGET_CHAIN.nativeCurrency.symbol}` 
      : "Wrong Network";
    
    setText("walletMobileAddress", shortAddr(address));
    setText("walletMobileBalance", balanceText);
  }
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function updateDropdown(address, chainId) {
  let dropdown = $id("walletDropdown");
  
  if (!dropdown) {
    const walletSlot = document.querySelector(".wallet-slot");
    if (!walletSlot) return;
    
    dropdown = document.createElement("div");
    dropdown.id = "walletDropdown";
    dropdown.className = "wallet-dropdown hidden";
    walletSlot.appendChild(dropdown);
  }
  
  const networkName = chainId === TARGET_CHAIN.chainId 
    ? TARGET_CHAIN.name 
    : `Chain #${chainId}`;
  
  dropdown.innerHTML = `
    <div class="wallet-dropdown__item wallet-dropdown__info">
      <div class="wallet-dropdown__label">Network</div>
      <div class="wallet-dropdown__value">${networkName}</div>
    </div>
    <div class="wallet-dropdown__divider"></div>
    <button class="wallet-dropdown__item wallet-dropdown__btn" id="copyAddressBtn" type="button">
      <i data-lucide="copy"></i>
      <span>Copy Address</span>
    </button>
    <button class="wallet-dropdown__item wallet-dropdown__btn wallet-dropdown__btn--danger" id="disconnectBtn" type="button">
      <i data-lucide="log-out"></i>
      <span>Disconnect</span>
    </button>
  `;
  
  const copyBtn = dropdown.querySelector("#copyAddressBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(address);
        const span = copyBtn.querySelector("span");
        const originalText = span.textContent;
        span.textContent = "Copied!";
        setTimeout(() => {
          span.textContent = originalText;
        }, 1500);
      } catch (err) {
        console.error("Copy failed:", err);
      }
    });
  }
  
  const disconnectBtn = dropdown.querySelector("#disconnectBtn");
  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", () => {
      disconnectWallet();
      closeDropdown();
    });
  }
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
