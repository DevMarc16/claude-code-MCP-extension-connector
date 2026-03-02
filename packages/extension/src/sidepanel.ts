const statusEl = document.getElementById('status')!;
const reconnectBtn = document.getElementById('reconnect')!;

async function updateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ command: 'get_bridge_status' });
    statusEl.textContent = response?.connected ? 'Connected' : 'Disconnected';
    statusEl.className = `status ${response?.connected ? 'connected' : 'disconnected'}`;
  } catch {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'status disconnected';
  }
}

reconnectBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ command: 'reconnect' });
  setTimeout(updateStatus, 1000);
});

setInterval(updateStatus, 2000);
updateStatus();