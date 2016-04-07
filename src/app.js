// components
import HeaderBar from './components/header-bar.vue'
import StatusBar from './components/status-bar.vue'
import BottomBar from './components/bottom-bar.vue'
import DownloadList from './components/download-list.vue'
import NewDownload from './components/new-download.vue'
import NewConnection from './components/new-connection.vue'

// requirements
import * as rpc from './services/rpc'
import * as util from './services/util'
import * as config from 'json!./config.json'
import * as _ from 'lodash'

export default {
  data () {
    return {
      originalDownloadList: [],
      selectedGids: [],
      server: Object.assign({}, config.defaultServer),
      serverHistory: [
      ],
      torrents: [],
      downloadSpeed: 0,
      uploadSpeed: 0,
      newDownloadModalShowing: false,
      defaultDestination: '',
      filter: '',
      loggedIn: false,
      dragOver: false
    }
  },
  computed: {
    selectedDownloads: function () {
      return this.downloadList.filter(download => ~this.selectedGids.indexOf(download.gid))
    },
    downloadList: function () {
      // sort by gid
      var list = this.originalDownloadList.slice(0).sort(function (a, b) {
        return b.gid > a.gid ? 1 : -1
      })
      // filter
      if (this.filter) {
        list = list.filter(download => {
          if (!download.files[0].path) return false
          return ~download.files[0].path.toLowerCase().indexOf(this.filter.toLowerCase())
        })
      }
      return list
    }
  },
  components: {
    HeaderBar,
    DownloadList,
    StatusBar,
    BottomBar,
    NewDownload,
    NewConnection
  },
  events: {
    startSelectedDownloads: function () {
      rpc.multicall(this.server, this.selectedGids.map(gid => ({methodName: 'aria2.unpause', params: [gid]})))
      .then(() => this.fetch())
    },
    pauseSelectedDownloads: function () {
      rpc.multicall(this.server, this.selectedGids.map(gid => ({methodName: 'aria2.pause', params: [gid]})))
      .then(() => this.fetch())
    },
    removeSelectedDownloads: function () {
      rpc.multicall(this.server, this.selectedDownloads.map(download => ({
        methodName: `aria2.${~['active', 'paused'].indexOf(download.status) ? 'remove' : 'removeDownloadResult'}`,
        params: [download.gid]
      })))
      .then(() => this.fetch())
    },
    showNewDownloadModal: function () {
      this.newDownloadModalShowing = true
    },
    addUriDownloads: function (download) {
      var args = download.uris.map((uri, i) => {
        let gid = util.addZeros(Date.now().toString(16), 14, 'f') + util.addZeros(i.toString(16), 2)
        return {
          methodName: 'aria2.addUri',
          params: [[uri], Object.assign({}, download.options, { gid: gid })]
        }
      })
      rpc.multicall(this.server, args)
      .then(() => this.fetch())
    },
    addTorrentDownloads: function (download) {
      var args = download.torrents.map((torrent, i) => {
        let gid = util.addZeros(Date.now().toString(16), 14, 'f') + util.addZeros(i.toString(16), 2)
        return {
          methodName: 'aria2.addTorrent',
          params: [torrent.base64, [], Object.assign({}, download.options, { gid: gid })]
        }
      })
      rpc.multicall(this.server, args)
      .catch(err => alert(err.message))
      .then(() => this.fetch())
    },
    connectToServer: function (server) {
      this.connectToServer(server)
      .catch(err => {
        alert(err.message)
      })
    },
    disconnect: function () {
      // this.server = {}
      this.loggedIn = false
    }
  },
  ready: function () {
    this.getServerHistory()
    var server = this.serverHistory[0]
    if (server) {
      this.server = Object.assign({}, server)
      this.connectToServer(server).catch(function (err) {
        return err
      })
    }
  },
  methods: {
    startFetching: function () {
      this.fetch()
      setInterval(this.fetch, config.fetchTime)
    },
    fetch: function () {
      if (!this.loggedIn) return
      rpc.multicall(this.server, {
        'aria2.getGlobalStat': null,
        'aria2.tellActive': [],
        'aria2.tellWaiting': [0, 1000],
        'aria2.tellStopped': [0, 1000]
      })
      .then(result => {
        this.downloadSpeed = Number(result[0].downloadSpeed)
        this.uploadSpeed = Number(result[0].uploadSpeed)
        var list = _.concat(result[1], result[2], result[3])
        this.originalDownloadList = list
      })
    },
    connectToServer: function (server) {
      return this.testConnection(server)
      .then(() => {
        // Login successed
        this.loggedIn = true
        this.server = Object.assign({}, server)
        // Get options
        this.getOptions()
        // Handle the history
        var duplicateIndex = _.findIndex(this.serverHistory, server)
        if (~duplicateIndex) this.serverHistory.splice(duplicateIndex, 1)
        this.serverHistory.unshift(server)
        // Start fetching
        this.startFetching()
      })
    },
    testConnection: function (server) {
      return rpc.call(server, 'aria2.getGlobalOption')
    },
    getOptions: function () {
      return rpc.call(this.server, 'aria2.getGlobalOption')
      .then(result => {
        this.defaultDestination = result.dir
        return result
      })
    },
    getServerHistory: function () {
      var history = window.localStorage.getItem('glutton_server_history')
      if (!history) return
      history = JSON.parse(history).map(function (server) {
        return Object.assign({}, config.defaultServer, server)
      })
      this.serverHistory = history
    },
    dropFiles: function (e) {
      let files = e.dataTransfer.files
      for (var i = 0; i < files.length; i++) {
        this.addTorrent(files[i])
      }
      this.newDownloadModalShowing = true
    },
    addTorrent: function (file) {
      this.type = 'bt'
      var reader = new FileReader()
      reader.onload = (e) => {
        this.torrents.push({
          name: file.name,
          base64: window.btoa(e.target.result)
        })
      }
      reader.readAsBinaryString(file)
    }
  },
  watch: {
    'serverHistory': function (value) {
      window.localStorage.setItem('glutton_server_history', JSON.stringify(value))
    },
    'downloadSpeed': function (value) {
      if (value === '0') document.title = 'Glutton'
      else document.title = '↓ ' + util.bytesToSize(value) + '/s - Glutton'
    }
  }
}
