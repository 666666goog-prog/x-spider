/* eslint-disable react/prop-types */
import React from 'react';
import { PageHeader } from '../components/PageHeader';
import { Section } from '../components/settings/Section';
import { Item } from '../components/settings/Item';
import { DownloadOutlined, GlobalOutlined } from '@ant-design/icons';
import Joi from 'joi';
import { SavePathSelector } from '../components/settings/SavePathSelector';
import { DownloadStylePreview } from '../components/settings/DownloadStylePreview';
import { Button, Input, Switch } from 'antd';
import { showInFolder } from '../utils/shell';
import { path } from '@tauri-apps/api';

export const Settings: React.FC = () => {
  return (
    <>
      <PageHeader />
      <Section title="下载" name="download" titleIcon={<DownloadOutlined />}>
        <Item
          validator={(value) => {
            return Joi.string()
              .messages({
                'string.empty': '请填写保存路径模板',
              })
              .validate(value).error?.message;
          }}
          label="保存路径"
          settingKey="saveDirBase"
        >
          <SavePathSelector required />
        </Item>
        <DownloadStylePreview />
        <Item
          settingKey="classifyByAuthor"
          label="按作者分文件夹"
          valuePropName="checked"
          description="每个账号一个文件夹"
        >
          <Switch />
        </Item>
        <Item
          settingKey="classifyByType"
          label="按类型分文件夹"
          valuePropName="checked"
          description="图片、视频、动图分开存放"
        >
          <Switch />
        </Item>
        <Item
          settingKey="classifyByDate"
          label="按日期分文件夹"
          valuePropName="checked"
          description="再按发布日期分，格式 年-月-日"
        >
          <Switch />
        </Item>
        <Item
          settingKey="classifyByPost"
          label="每个作品一个文件夹"
          valuePropName="checked"
          description="一条推文有多个文件时，单独建一个文件夹装在一起；只有一个文件的推文不建"
        >
          <Switch />
        </Item>
        <Item
          settingKey="fileNameWithDate"
          label="文件名带日期"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          settingKey="fileNameWithAuthor"
          label="文件名带作者名"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          settingKey="fileNameWithContent"
          label="文件名带推文内容"
          valuePropName="checked"
          description="带上推文正文的前 24 个字，相当于作品标题；推文没文字时自动不带"
        >
          <Switch />
        </Item>
        <Item
          settingKey="fileNameWithPostId"
          label="文件名带推文编号"
          valuePropName="checked"
          description="关掉后文件名更短，但重名风险变高"
        >
          <Switch />
        </Item>
        <Item
          settingKey="sameFileSkip"
          label="跳过相同文件"
          valuePropName="checked"
          description="存在同名文件时，是否跳过下载"
        >
          <Switch />
        </Item>
      </Section>
      <Section title="代理" name="proxy" titleIcon={<GlobalOutlined />}>
        <Item label="启用代理" settingKey="enable" valuePropName="checked">
          <Switch />
        </Item>
        <Item
          label="使用系统代理"
          settingKey="useSystem"
          valuePropName="checked"
          description="自动使用系统代理，如果代理未生效，可能是你的代理软件没有自动设置系统代理，此时请手动配置代理地址。"
        >
          <Switch />
        </Item>
        <Item
          label="代理地址"
          settingKey="url"
          validator={(val) => {
            return Joi.string()
              .uri({
                scheme: ['http'],
              })
              .message('代理地址格式不正确，示例：“http://127.0.0.1:7890”')
              .validate(val).error?.message;
          }}
        >
          <Input placeholder="代理地址，例如：“http://127.0.0.1:7890”" />
        </Item>
      </Section>
      <Section title="应用" name="app">
        <Item
          label="自动检查更新"
          settingKey="autoCheckUpdate"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          label="接收预览版"
          description="预览版更新更频繁，能获取到最新的特性，但不太稳定，可能会出现各种错误。"
          settingKey="acceptPrerelease"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          label="记录日志文件"
          description="日志文件可能体积较大，建议软件运行出问题需要上报时再开启，开启后请重启软件。"
          settingKey="writeLogs"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Button
          onClick={async () => {
            await showInFolder(await path.appLogDir());
          }}
        >
          打开日志文件夹
        </Button>
      </Section>
    </>
  );
};
