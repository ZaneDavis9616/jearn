const express = require('express');
const kuromoji = require('kuromoji');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
const port = 3000;

app.use(express.json());

const { TextToSpeechClient } = require('@google-cloud/text-to-speech');
const ttsClient = new TextToSpeechClient();
const csv = require('csv-parser');

let tokenizer = null;
const jlptWordMap = new Map();

// Function to load JLPT vocabulary
const loadVocabulary = () => {
  console.log('Loading JLPT vocabulary from CSV...');
  const filePath = '/Users/user/Downloads/all.csv'; // Use the absolute path provided by the user

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      const expression = row.expression;
      const tags = row.tags;

      let level = 'N0'; // Default to N0 if no level found
      const match = tags.match(/JLPT_([1-5])/); // Look for JLPT_1, JLPT_2, etc.
      if (match) {
        level = 'N' + match[1];
      }

      if (expression && !jlptWordMap.has(expression)) {
        jlptWordMap.set(expression, level);
      }
      if (row.reading && !jlptWordMap.has(row.reading)) {
        jlptWordMap.set(row.reading, level);
      }
    })
    .on('end', () => {
      console.log(`Vocabulary loaded. Total unique entries: ${jlptWordMap.size}`);
    })
    .on('error', (err) => {
      console.error('Error loading vocabulary from CSV:', err);
    });
};


// Initialize the tokenizer and load vocabulary
kuromoji.builder({ dicPath: 'node_modules/kuromoji/dict' }).build((err, builtTokenizer) => {
  if (err) {
    console.error('Error building tokenizer:', err);
    return;
  }
  console.log('Tokenizer ready.');
  tokenizer = builtTokenizer;
  loadVocabulary(); // Load vocab after tokenizer is ready
});

app.post('/api/parse', (req, res) => {
  if (!tokenizer) {
    return res.status(503).send({ error: 'Tokenizer is not ready yet.' });
  }

  const text = req.body.text;
  if (!text) {
    return res.status(400).send({ error: 'Text is required.' });
  }

  const tokens = tokenizer.tokenize(text);

  const processedTokens = tokens.map(token => {
    // Use basic_form for lookup, fallback to surface_form
    const lookupKey = token.basic_form !== '*' ? token.basic_form : token.surface_form;
    const difficulty = jlptWordMap.get(lookupKey) || jlptWordMap.get(token.surface_form) || 'N0';

    return {
      surface: token.surface_form,
      reading: token.reading, // kuromoji provides katakana reading
      pos: token.pos,
      difficulty: difficulty,
    };
  });

  res.send({ tokens: processedTokens });
});

app.post('/api/synthesize', async (req, res) => {
  const { tokens, audioDuration } = req.body;
  if (!tokens || !Array.isArray(tokens)) {
    return res.status(400).send({ error: 'Tokens are required.' });
  }

  const escapeSsml = (text) => {
    return text.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;')
               .replace(/"/g, '&quot;')
               .replace(/'/g, '&apos;')
               .replace(/\n/g, ' ')
               .replace(/\r/g, ' ')
               .replace(/\t/g, ' ');
  };

  // Create SSML from tokens for synthesis
  // Each token is marked with a unique name to get its timestamp
  let ssml = '<speak>';
  tokens.forEach((token, index) => {
    // 按照Google TTS文档，mark标签应该放在要标记的文本之前
    ssml += `<mark name="token_${index}"/>${escapeSsml(token.surface)}`;
  });
  // 添加最后一个标记来标记音频结束
  ssml += `<mark name="token_${tokens.length}"/>`;
  ssml += '</speak>';

  console.log('Generated SSML:', ssml);

  const request = {
    input: { ssml },
    voice: { languageCode: 'ja-JP', name: 'ja-JP-Standard-A' },
    audioConfig: { 
      audioEncoding: 'MP3',
      speakingRate: 1.0,
      pitch: 0.0
    },
    enableTimePointing: ['SSML_MARK'],
  };

  try {
    const [response] = await ttsClient.synthesizeSpeech(request);
    const audioContent = response.audioContent.toString('base64');
    const timepoints = Array.isArray(response.timepoints) ? response.timepoints : [];
    console.log(`TTS synthesis completed. Audio length: ${audioContent.length} chars, Timepoints: ${timepoints.length}`);
    
    if (timepoints.length === 0) {
      console.log('WARNING: No timepoints returned from Google TTS API');
      console.log('SSML that was sent:', ssml);
      console.log('Using fallback timing estimation...');
      
      // 改进的备用方案：根据token长度和音频时长估算时间点
      // 使用传入的音频时长或默认值
      const actualAudioDuration = audioDuration || 7.32; // 使用传入的时长或默认值
      
      // 计算每个字符的平均时长
      const totalChars = tokens.reduce((sum, token) => sum + token.surface.length, 0);
      const charDuration = actualAudioDuration / totalChars;
      
      let currentTime = 0;
      const timedTokens = tokens.map((token, index) => {
        const startTime = currentTime;
        const tokenDuration = token.surface.length * charDuration;
        currentTime += tokenDuration;
        const endTime = currentTime;
        
        console.log(`Token ${index} (${token.surface}): estimated ${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s`);
        
        return {
          ...token,
          startTime: startTime,
          endTime: endTime,
        };
      });
      
      res.send({ audioContent, tokens: timedTokens, timepoints: [] });
      return;
    }

    // Map timepoints back to tokens
    const timedTokens = tokens.map((token, index) => {
      // 修复时间点匹配：使用新的mark名称格式
      const startTimepoint = timepoints.find(tp => 
        tp.markName === `token_${index}` || 
        tp.markName === String(index) || 
        tp.markName === index || 
        tp.markName === index.toString()
      );
      const nextTokenStartTimepoint = timepoints.find(tp => 
        tp.markName === `token_${index + 1}` || 
        tp.markName === String(index + 1) || 
        tp.markName === (index + 1) || 
        tp.markName === (index + 1).toString()
      );

      const startTime = startTimepoint ? startTimepoint.timeSeconds : 0;
      const endTime = nextTokenStartTimepoint ? nextTokenStartTimepoint.timeSeconds : null;

      return {
        ...token,
        startTime: startTime,
        endTime: endTime,
      };
    });

    res.send({ audioContent, tokens: timedTokens, timepoints: timepoints });

  } catch (error) {
    console.error('Error synthesizing speech:', error);
    res.status(500).send({ error: 'Failed to synthesize speech.' });
  }
});

app.listen(port, () => {
  console.log(`Backend server listening at http://localhost:${port}`);
});
