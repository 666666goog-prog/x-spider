/* eslint-disable react/prop-types */
import { App, Avatar, Button, Divider, Input, Modal } from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { useAppStateStore } from '../stores/app-state';
import { getAccountInfo } from '../twitter/api';
import { TwitterAccountInfo } from '../interfaces/TwitterAccountInfo';
import { LogoutOutlined } from '@ant-design/icons';
import { parseCookie, stringifyCookie } from '../utils/cookie';
import {
  startBrowserLogin,
  stopBrowserLogin,
  waitForLoginCookies,
} from '../utils/browser-login';
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
  const [waiting, setWaiting] = useState(false);
  const [waitingStatus, setWaitingStatus] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteLoading, setPasteLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<string[]>([]);
  const [switchingName, setSwitchingName] = useState('');
  const stopWaitingRef = useRef(false);
  const { message } = App.useApp();

  useEffect(() => {
    (async () => {
      if (!cookieString) {
        setAccountInfo(null);
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

  const handleBrowserLogin = async () => {
    stopWaitingRef.current = false;
    setWaiting(true);
    setWaitingStatus('');
    try {
      await startBrowserLogin();
    } catch (err: any) {
      setWaiting(false);
      log.error(err);
      message.error(
        typeof err === 'string' ? err : '打开浏览器失败，请再试一次',
      );
      return;
    }

    const { cookie: result, lastError } = await waitForLoginCookies(
      () => stopWaitingRef.current,
      setWaitingStatus,
    );

    if (!result) {
      setWaiting(false);
      if (!stopWaitingRef.current) {
        message.error(
          lastError
            ? `自动读取没成功（${lastError}），可以改用下面粘贴 Cookie 的办法`
            : '等待登录超时，请再试一次',
        );
        try {
          await stopBrowserLogin();
        } catch {
          // ignore
        }
      }
      return;
    }

    try {
      const info = await getAccountInfo(result);
      setAccountInfo(info);
      setCookieString(result);
      setModalOpen(false);
      message.success(`已登录：@${info.screenName}`);
    } catch (err: any) {
      log.error(err);
      message.error('登录没有成功，请再试一次');
    } finally {
      setWaiting(false);
      try {
        await stopBrowserLogin();
      } catch {
        // ignore
      }
    }
  };

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

  const handleCancelWaiting = async () => {
    stopWaitingRef.current = true;
    setWaiting(false);
    try {
      await stopBrowserLogin();
    } catch {
      // ignore
    }
  };

  const handleModalCancel = async () => {
    if (waiting) {
      await handleCancelWaiting();
    }
    setModalOpen(false);
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
        onCancel={handleModalCancel}
        open={modalOpen}
        title="登录 X"
        footer={null}
      >
        <p className="mt-4">
          点下面的按钮会打开一个浏览器窗口，在里面像平时一样登录
          X，登录成功后这里会自动完成，不用做别的。
        </p>
        {!waiting ? (
          <Button
            type="primary"
            block
            className="mt-4"
            onClick={handleBrowserLogin}
          >
            打开浏览器登录
          </Button>
        ) : (
          <div className="mt-4">
            <p role="status">
              {waitingStatus || '等待登录中…在打开的窗口里完成登录即可'}
            </p>
            <Button block className="mt-3" onClick={handleCancelWaiting}>
              取消
            </Button>
          </div>
        )}
        <Divider />
        <Input.TextArea
          rows={4}
          placeholder="或者把整串 Cookie 粘贴到这里"
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
        />
        <Button
          block
          className="mt-3"
          loading={pasteLoading}
          onClick={handlePasteSave}
        >
          保存并校验
        </Button>
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
