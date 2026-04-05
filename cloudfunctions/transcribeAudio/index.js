const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

let asrConfig = {};

try {
  const config = require('./config.js');
  asrConfig = config.asrConfig || {};
} catch (error) {
  asrConfig = {};
}

const SUCCESS_CODE = 1000;
const RUNNING_CODES = [2000, 2001];
const SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
const QUERY_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createUserId() {
  return `wx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createTaskId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createHeaders(taskId) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Api-Resource-Id': asrConfig.resourceId || 'volc.seedasr.auc',
    'X-Api-Request-Id': taskId,
    'X-Api-Sequence': '-1'
  };

  if (asrConfig.apiKey) {
    headers['X-Api-Key'] = asrConfig.apiKey;
  } else {
    headers['X-Api-App-Key'] = asrConfig.appId;
    headers['X-Api-Access-Key'] = asrConfig.accessToken;
  }

  return headers;
}

function extractTranscript(result) {
  if (!result) {
    return '';
  }

  if (typeof result.text === 'string' && result.text.trim()) {
    return result.text.trim();
  }

  const utterances = Array.isArray(result.utterances) ? result.utterances : [];
  const utteranceText = utterances.map(item => item.text || '').join('').trim();
  if (utteranceText) {
    return utteranceText;
  }

  const paragraphs = Array.isArray(result.paragraphs) ? result.paragraphs : [];
  const paragraphText = paragraphs.map(item => item.text || '').join('').trim();
  if (paragraphText) {
    return paragraphText;
  }

  return '';
}

async function getAudioUrl(fileID) {
  const res = await cloud.getTempFileURL({
    fileList: [fileID]
  });
  const file = res.fileList && res.fileList[0];

  if (!file || !file.tempFileURL) {
    throw new Error('获取语音文件地址失败');
  }

  return file.tempFileURL;
}

async function submitTranscriptionTask(audioUrl, format) {
  const taskId = createTaskId();
  const payload = {
    user: {
      uid: createUserId()
    },
    audio: {
      format: format || 'mp3',
      url: audioUrl,
      language: asrConfig.language || 'zh-CN'
    },
    request: {
      model_name: asrConfig.modelName || 'bigmodel',
      enable_itn: asrConfig.enableItn !== false,
      enable_punc: asrConfig.enablePunc !== false
    }
  };

  const response = await axios.post(
    SUBMIT_URL,
    payload,
    {
      headers: createHeaders(taskId),
      timeout: 60000
    }
  );

  const task = response.data && response.data.resp;

  if (!task || task.message !== 'success' || !task.id) {
    throw new Error((task && task.message) || '提交转写任务失败');
  }

  return task.id || taskId;
}

async function queryTranscriptionTask(taskId) {
  const response = await axios.post(
    QUERY_URL,
    {},
    {
      headers: createHeaders(taskId),
      timeout: 60000
    }
  );

  return response.data || {};
}

async function waitForTranscript(taskId) {
  for (let index = 0; index < 20; index += 1) {
    const result = await queryTranscriptionTask(taskId);
    const resp = result.resp || result.result || result;
    const code = resp.code;
    const transcript = extractTranscript(result) || extractTranscript(resp);

    if (code === SUCCESS_CODE) {
      return transcript;
    }

    if (!RUNNING_CODES.includes(code)) {
      throw new Error(resp.message || result.message || '语音转写失败');
    }

    await sleep(2000);
  }

  throw new Error('语音转写超时');
}

exports.config = {
  timeout: 60000
};

exports.main = async event => {
  try {
    const { fileID, format } = event;

    if (!fileID) {
      return {
        success: false,
        message: '缺少语音文件'
      };
    }

    if (!asrConfig.apiKey && (!asrConfig.appId || !asrConfig.accessToken)) {
      return {
        success: false,
        message: '请先在 transcribeAudio 的 config.js 中配置语音识别密钥'
      };
    }

    const audioUrl = await getAudioUrl(fileID);
    const taskId = await submitTranscriptionTask(audioUrl, format);
    const transcript = await waitForTranscript(taskId);

    if (!transcript) {
      return {
        success: false,
        message: '未识别到语音内容'
      };
    }

    return {
      success: true,
      transcript: transcript
    };
  } catch (error) {
    console.error('语音转写失败', error);
    return {
      success: false,
      message: error.message || '语音转写失败'
    };
  }
};
