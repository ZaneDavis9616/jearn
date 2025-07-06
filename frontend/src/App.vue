<template>
  <div id="app">
    <h1>Jearn - 日语学习工具</h1>
    <textarea v-model="text" placeholder="在此输入日文文本..."></textarea>
    <div class="actions">
      <button @click="parseText" :disabled="isLoading">
        {{ isLoading ? '解析中...' : '解析文本' }}
      </button>
      <button @click="synthesizeSpeech" :disabled="!tokens.length || isLoading" class="primary">
        {{ isLoading ? '合成中...' : '合成并播放语音' }}
      </button>
    </div>

    <div v-if="audioSrc" class="audio-player">
      <audio 
        ref="audio" 
        :src="audioSrc" 
        controls 
        @timeupdate="onTimeUpdate"
        @loadedmetadata="onAudioLoaded"
        @play="onAudioPlay"
        @pause="onAudioPause"
      ></audio>
    </div>

    <div v-if="tokens.length > 0" class="results">
      <h2>解析结果：</h2>
      <p class="highlight-text">
        <span
          v-for="(token, index) in tokens"
          :key="index"
          :class="{ highlight: index === currentTokenIndex }"
          class="token"
        >
          {{ token.surface }}
        </span>
      </p>
      <table>
        <thead>
          <tr>
            <th>表面形式</th>
            <th>发音 (Reading)</th>
            <th>词性 (POS)</th>
            <th>难度 (Level)</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(token, index) in tokens" :key="index" :class="{ highlight: index === currentTokenIndex }">
            <td>{{ token.surface }}</td>
            <td>{{ token.reading }}</td>
            <td>{{ token.pos }}</td>
            <td>{{ token.difficulty }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      text: '日本語を勉強する',
      tokens: [],
      isLoading: false,
      audioSrc: null,
      currentTokenIndex: -1,
    };
  },
  methods: {
    async parseText() {
      this.isLoading = true;
      this.tokens = [];
      this.audioSrc = null;
      this.currentTokenIndex = -1;
      try {
        const response = await fetch('http://localhost:3000/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: this.text }),
        });
        const data = await response.json();
        this.tokens = data.tokens;
      } catch (error) {
        console.error('Error parsing text:', error);
      } finally {
        this.isLoading = false;
      }
    },
    async synthesizeSpeech() {
      this.isLoading = true;
      this.audioSrc = null;
      this.currentTokenIndex = -1;
      try {
        const response = await fetch('http://localhost:3000/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tokens: this.tokens }),
        });
        const data = await response.json();
        this.tokens = data.tokens; // Update tokens with timing info
        this.audioSrc = `data:audio/mp3;base64,${data.audioContent}`;
        console.log('Received tokens with timing:', this.tokens);
        console.log('Received timepoints from backend:', data.timepoints);
      } catch (error) {
        console.error('Error synthesizing speech:', error);
      } finally {
        this.isLoading = false;
      }
    },
    onTimeUpdate() {
      const audio = this.$refs.audio;
      if (!audio || !this.tokens.length || !audio.duration) return;

      const currentTime = audio.currentTime;
      console.log('onTimeUpdate: currentTime =', currentTime);
      
      // 检查是否有有效的时间信息
      const hasValidTiming = this.tokens.some(token => 
        typeof token.startTime === 'number' && token.startTime >= 0
      );
      console.log('tokens:', this.tokens);
      if (!hasValidTiming) {
        this.currentTokenIndex = -1;
        return;
      }
      
      let activeToken = -1;
      for (let i = 0; i < this.tokens.length; i++) {
        const token = this.tokens[i];
        const tokenStartTime = token.startTime;
        const tokenEndTime = (token.endTime === null || typeof token.endTime !== 'number') ? audio.duration : token.endTime;
        console.log(`token[${i}]: startTime=${tokenStartTime}, endTime=${tokenEndTime}`);
        if (typeof tokenStartTime !== 'number' || typeof tokenEndTime !== 'number') {
          continue;
        }
        if (currentTime >= tokenStartTime && currentTime < tokenEndTime) {
          activeToken = i;
          break;
        }
      }
      console.log('activeToken:', activeToken);
      this.currentTokenIndex = activeToken;
    },
    onAudioLoaded() {
      console.log('Audio loaded, duration:', this.$refs.audio?.duration);
      // 重置高亮状态
      this.currentTokenIndex = -1;
      
      // 如果音频时长与估算的不同，重新获取时间点
      if (this.$refs.audio && this.$refs.audio.duration > 0) {
        this.updateTimingWithActualDuration(this.$refs.audio.duration);
      }
    },
    async updateTimingWithActualDuration(audioDuration) {
      try {
        const response = await fetch('http://localhost:3000/api/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            tokens: this.tokens.map(t => ({ surface: t.surface, reading: t.reading, pos: t.pos, difficulty: t.difficulty })),
            audioDuration: audioDuration 
          }),
        });
        const data = await response.json();
        this.tokens = data.tokens; // Update tokens with accurate timing
        console.log('Updated tokens with actual duration:', this.tokens);
      } catch (error) {
        console.error('Error updating timing:', error);
      }
    },
    onAudioPlay() {
      console.log('Audio started playing');
    },
    onAudioPause() {
      console.log('Audio paused');
    },
  },
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  color: #2c3e50;
  margin: 60px auto;
  max-width: 800px;
  padding: 0 20px;
}

textarea {
  width: 100%;
  height: 100px;
  margin-bottom: 20px;
  box-sizing: border-box;
}

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

button {
  padding: 10px 20px;
  font-size: 16px;
  cursor: pointer;
  border: 1px solid #ccc;
  background-color: #f0f0f0;
}

button.primary {
  border-color: #42b983;
  background-color: #42b983;
  color: white;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.audio-player {
  margin-bottom: 20px;
}

audio {
  width: 100%;
}

.results {
  margin-top: 20px;
}

.highlight-text {
  font-size: 1.5em;
  line-height: 2;
  margin-bottom: 20px;
}

.token.highlight {
  background-color: #f9f2a1;
}

table {
  border-collapse: collapse;
  width: 100%;
}

th, td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

thead {
  background-color: #f2f2f2;
}

tr.highlight {
  background-color: #f9f2a1;
}
</style>