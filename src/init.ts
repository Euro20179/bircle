import common from './common'

let INITIALIZED = false

function init(done?: Function){
    common.loadMatchCommands()
    common.reloadBlackList()
    common.reloadWhiteList()
    common.reloadIDBlackLists()
    INITIALIZED = true
    done?.()
}

export default {
    INITIALIZED,
    init
}
