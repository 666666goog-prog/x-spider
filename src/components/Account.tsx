/* eslint-disable react/prop-types */
import { Alert, App, Avatar, Button, Divider, Input, Modal } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useAppStateStore } from '../stores/app-state';
import { getAccountInfo } from '../twitter/api';
import { TwitterAccountInfo } from '../interfaces/TwitterAccountInfo';
import { LogoutOutlined } from '@ant-design/icons';
import { parseCookie, stringifyCookie } from '../utils/cookie';
import {
  deleteAccountCookie,
  listSavedAccounts,
  loadAccountCookie,
  saveAccountCookie,
} from '../utils/account-store';
import clsx from 'clsx';

export const Account: React.FC = () => {
  const [cookieString, setCookieString] = useAppStateStore((state) => [
    state.cookieString,
    state.setCookieString,
  ]);
  const [modalOpen, setModalOpen] = useState(false);
  const [accountInfo, setAccountInfo] = useState<TwitterAccountInfo | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<string[]>([]);
  const [switchingName, setSwitchingName] = useState('');
  // The cookie a switch/paste handler has just verified itself. The
  // cookieString effect below skips it, instead of verifying the same
  // cookie a second time and doubling the wait.
  const verifiedCookieRef = useRef('');
  // Dragging the login modal by its title bar with the mouse.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const handleDragMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.ant-modal-header')) {
      return;
    }
    if (target.closest('.ant-modal-close')) {
      return;
    }
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: dragOffset.x,
      baseY: dragOffset.y,
    };
    const onMove = (ev: MouseEvent) => {
      const state = dragStateRef.current;
      if (!state) {
        return;
      }
      setDragOffset({
        x: state.baseX + ev.clientX - state.startX,
        y: state.baseY + ev.clientY - state.startY,
      });
    };
    const onUp = () => {
      dragStateRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  const { message } = App.useApp();

  useEffect(() => {
    (async () => {
      if (!cookieString) {
        setAccountInfo(null);
      } else if (cookieString === verifiedCookieRef.current) {
        // Just verified by the handler that set it; do not verify again.
      } else {
        setLoading(true);
        try {
          const info = await getAccountInfo(cookieString);
          setAccountInfo(info);
          // Keep a plain-text copy of this account's cookie in the data
          // folder, so it can be switched back to later in one click.
          saveAccountCookie(info.screenName, cookieString).catch(() => {});
        } catch (err: any) {
          message.error('获取账号信息失败，请检查 Cookie 或代理配置是否正确');
          log.error(err);
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [cookieString]);

  useEffect(() => {
    if (modalOpen) {
      listSavedAccounts()
        .then(setSavedAccounts)
        .catch(() => setSavedAccounts([]));
    }
  }, [modalOpen]);

  const handleSwitchAccount = async (name: string) => {
    setSwitchingName(name);
    try {
      const cookie = await loadAccountCookie(name);
      if (!cookie) {
        message.error('这个账号的登录文件不见了，请重新登录一次');
        return;
      }
      const info = await getAccountInfo(cookie);
      setAccountInfo(info);
      verifiedCookieRef.current = cookie;
      setCookieString(cookie);
      setModalOpen(false);
      message.success(`已切换到：@${info.screenName}`);
    } catch (err: any) {
      log.error(err);
      message.error('切换失败，这个账号的登录可能已经过期，请重新登录一次');
    } finally {
      setSwitchingName('');
    }
  };

  const handleDeleteAccount = async (name: string) => {
    await deleteAccountCookie(name).catch(() => {});
    setSavedAccounts(await listSavedAccounts().catch(() => []));
  };

  const handlePasteSave = async () => {
    const text = pasteText.trim().replace(/^cookie\s*:\s*/i, '');
    if (!text) {
      message.error('请先粘贴 Cookie');
      return;
    }

    const parsed = parseCookie(text);
    const authToken = parsed['auth_token'];
    const ct0 = parsed['ct0'];
    if (!authToken || !ct0) {
      message.error('粘贴的内容里必须包含 auth_token 和 ct0');
      return;
    }

    const newCookieString = stringifyCookie({
      auth_token: authToken,
      ct0,
    });

    setPasteLoading(true);
    try {
      const info = await getAccountInfo(newCookieString);
      setAccountInfo(info);
      saveAccountCookie(info.screenName, newCookieString).catch(() => {});
      verifiedCookieRef.current = newCookieString;
      setCookieString(newCookieString);
      setModalOpen(false);
      message.success(`已登录：@${info.screenName}`);
    } catch (err: any) {
      log.error(err);
      message.error('登录没有成功，请检查粘贴的内容或代理配置是否正确');
    } finally {
      setPasteLoading(false);
    }
  };

  return (
    <>
      <div className="px-4">
        <section
          aria-label="个人信息"
          className="flex flex-col justify-center items-center border-b-[1px] py-6 border-[rgba(255,255,255,0.5)]"
        >
          {!accountInfo && (
            <>
              <button
                disabled={loading}
                className={clsx(
                  'bg-transparent',
                  loading && 'hover:cursor-wait',
                )}
                onClick={() => setModalOpen(true)}
              >
                <Avatar size={50}>{loading ? '加载中' : '登录'}</Avatar>
              </button>
              <span className="sr-only" role="alert">
                账号未登录
              </span>
            </>
          )}
          {accountInfo && (
            <>
              <span className="sr-only" role="alert">
                账号 {accountInfo.screenName} 已登录
              </span>
              <a
                className="focus:outline !outline-4 !outline-black"
                title="前往个人主页"
                aria-label="前往个人主页"
                target="_blank"
                href={`https://twitter.com/${accountInfo.screenName}`}
                rel="noreferrer"
              >
                <Avatar size={50} src={accountInfo.avatar} alt="头像" />
              </a>
              <div className="text-white mt-1 font-bold">
                {accountInfo.screenName}
              </div>
              <div>
                <button
                  onClick={() => {
                    setCookieString('');
                  }}
                  className="text-white bg-transparent hover:text-gray-200 transition-colors text-sm"
                >
                  <LogoutOutlined aria-hidden />
                  <span className="ml-1">登出</span>
                </button>
              </div>
            </>
          )}
        </section>
      </div>
      <Modal
        onCancel={() => setModalOpen(false)}
        open={modalOpen}
        title="登录 X"
        footer={null}
        modalRender={(modal) => (
          <div
            style={{
              transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
            }}
            onMouseDown={handleDragMouseDown}
          >
            {modal}
          </div>
        )}
      >
        <p className="mt-4">
          把整串 Cookie 粘贴到下面，点「保存并校验」就行。登录成功会自动保存这个账号，下次直接在下面点账号名字切换。这个窗口挡住东西时，按住最上面的标题可以用鼠标把它拖开。
        </p>
        <Input.TextArea
          className="mt-3"
          rows={4}
          placeholder="把整串 Cookie 粘贴到这里（要包含 auth_token 和 ct0）"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <Button
          type="primary"
          block
          className="mt-3"
          loading={pasteLoading}
          onClick={handlePasteSave}
        >
          保存并校验
        </Button>
        <Alert
          className="mt-4"
          type="warning"
          showIcon
          message="账号提示"
          description="登录用的账号如果已经被 X 冻结（只读状态），它能下的账号只有一部分，有些账号会解析不了、提示加载失败——这是 X 对被冻结账号的限制，不是对方账号有问题，也不是软件坏了。遇到这种情况，换一个没被冻结的账号登录再搜就行。"
        />
        {savedAccounts.length > 0 && (
          <>
            <Divider />
            <p className="mb-2">
              已保存的账号，点一下就切换，不用重新登录（登录文件存在软件目录的
              accounts 文件夹里）：
            </p>
            {savedAccounts.map((name) => (
              <div key={name} className="flex items-center gap-2 mb-2">
                <Button
                  block
                  loading={switchingName === name}
                  onClick={() => handleSwitchAccount(name)}
                >
                  @{name}
                  {accountInfo?.screenName === name ? '（当前）' : ''}
                </Button>
                <Button danger onClick={() => handleDeleteAccount(name)}>
                  删除
                </Button>
              </div>
            ))}
          </>
        )}
      </Modal>
    </>
  );
};
