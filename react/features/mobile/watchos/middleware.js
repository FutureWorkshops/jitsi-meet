import { Platform } from 'react-native';
import * as watch from 'react-native-watch-connectivity';

import { setConferenceURL } from './actions';
import {
    SET_CONFERENCE_URL,
    SET_MIC_MUTED,
    SET_RECENT_URLS
} from './actionTypes';
import { APP_WILL_MOUNT, APP_WILL_UNMOUNT, appNavigate } from '../../app';
import {
    getCurrentConference
} from '../../base/conference';
import {
    MEDIA_TYPE,
    setAudioMuted
} from '../../base/media';
import { MiddlewareRegistry, StateListenerRegistry } from '../../base/redux';
import { getInviteURL } from '../../base/connection';
import { isLocalTrackMuted } from '../../base/tracks';

StateListenerRegistry.register(
    /* selector */ state => state['features/recent-list'],
    /* listener */ (currentState, store) => {
        console.info('SET RECENT URLS: ', currentState);
        store.dispatch({
            type: SET_RECENT_URLS,
            recentURLs: currentState
        });
    });

StateListenerRegistry.register(
    /* selector */ state => {
        return isLocalTrackMuted(
            state['features/base/tracks'], MEDIA_TYPE.AUDIO);
    },
    /* listener */ (isAudioMuted, store) => {
        store.dispatch({
            type: SET_MIC_MUTED,
            micMuted: isAudioMuted
        });
    });

StateListenerRegistry.register(
    /* selector */ state => getCurrentConference(state),
    /* listener */ (currentConference, store) => {
        const inviteUrl = getInviteURL(store.getState());

        store.dispatch(setConferenceURL(inviteUrl ? inviteUrl : 'NULL'));
    });

/**
 * Middleware that captures conference actions and sets the correct audio mode
 * based on the type of conference. Audio-only conferences don't use the speaker
 * by default, and video conferences do.
 *
 * @param {Store} store - The redux store.
 * @returns {Function}
 */
MiddlewareRegistry.register(({ dispatch, getState }) => next => action => {
    const result = next(action);

    if (Platform.OS !== 'ios') {
        return result;
    }

    switch (action.type) {
    case APP_WILL_MOUNT: {
        _appWillMount({
            dispatch,
            getState
        });
        break;
    }

    /* case SET_AUDIO_MUTED: {
        const { audio } = getState()['features/base/media'];

        dispatch({
            type: SET_MIC_MUTED,
            micMuted: Boolean(audio.muted)
        });
        break;
    }*/

    /* case CONFERENCE_FAILED:
    case CONFERENCE_WILL_LEAVE: {
        const conferenceURL = _getConferenceUrlFromBaseConf(getState);
        const watchConferenceURL = _getWatchConferenceURL(getState);

        // This may not be a real failure
        if (action.type === CONFERENCE_FAILED) {
            const conference = getState()['features/base/conference'];

            if (conference.authRequired || conference.passwordRequired) {

                break;
            }
        }

        // FIXME I have bad feelings about this logic, but it aims to fix
        // problem with setting NULL temporarily when selecting new conference
        // on the watch while still in the previous room. It will first emit
        // CONFERENCE_WILL_LEVE, before joining the new room and we don't want
        // to send NULL.
        if (watchConferenceURL !== 'NULL'
                && watchConferenceURL !== conferenceURL) {
            console.info(
                'Ignored action',
                action.type,
                `possibly for the previous conference ?: ${conferenceURL}`);
        } else if (action.type === CONFERENCE_WILL_LEAVE
                && conferenceURL === watchConferenceURL) {
            dispatch(setConferenceURL('NULL'));
        } else if (conferenceURL !== watchConferenceURL) {
            dispatch(setConferenceURL(conferenceURL));
        } else {
            console.info(
                'Did nothing on',
                action.type,
                conferenceURL,
                watchConferenceURL);
        }
        break;
    }
    case CONFERENCE_WILL_JOIN:
    case CONFERENCE_JOINED: {
        // NOTE for some reason 'null' does not update context - must be string
        const conferenceURL = _getConferenceUrlFromBaseConf(getState);
        const oldConferenceURL = _getWatchConferenceURL(getState);

        // NOTE Those updates are expensive!
        if (conferenceURL !== oldConferenceURL) {
            dispatch(setConferenceURL(conferenceURL));
        }
        break;
    } */

    // Here list all actions that affect the watch OS application context.
    // The reducer should form all those actions into our context structure.
    case SET_CONFERENCE_URL:
    case SET_MIC_MUTED:
    case SET_RECENT_URLS: {
        _updateApplicationContext(getState);
        break;
    }
    case APP_WILL_UNMOUNT:
        break;
    }

    return result;
});

function _appWillMount({ dispatch, getState }) {
    watch.subscribeToWatchState((err, watchState) => {
        if (!err) {
            // console.log('watchState', watchState);

            // FIXME that does not seem to help with the initial sync up
            // if (watchState === 'Activated') {
            //    _updateApplicationContext(getState);
            // }
        } else {
            console.log('ERROR getting watchState');
        }
    });

    watch.subscribeToMessages((err, message) => {
        if (err) {
            console.log('ERROR getting watch message');
        } else {
            switch (message.command) {
            case 'joinConference': {
                const newConferenceURL = message.data;
                const oldConferenceURL
                    = _getConferenceUrlFromBaseConf(getState);

                console.info(`WATCH - JOIN URL: ${newConferenceURL}`);
                if (oldConferenceURL === newConferenceURL) {
                    console.info('No need to navigate');
                } else {
                    // Set conference URL early to avoid NULL being sent as
                    // part of other updates.
                    // FIXME check if we'd go back to NULL on join failure.
                    // dispatch(setConferenceURL(newConferenceURL));
                    dispatch(appNavigate(newConferenceURL));
                }
                break;
            }
            case 'toggleMute':
                console.info('WATCH - TOGGLE MUTED');
                toggleAudioMuted({
                    dispatch,
                    getState
                });
                break;
            case 'hangup':
                console.info('WATCH - HANG UP');
                if (_getConferenceUrlFromBaseConf(getState) !== 'NULL') {
                    dispatch(appNavigate(undefined));
                }
                break;
            }
        }
    });
}

function toggleAudioMuted({ dispatch, getState }) {
    const tracks = getState()['features/base/tracks'];
    const isAudioMuted = isLocalTrackMuted(tracks, MEDIA_TYPE.AUDIO);

    dispatch(setAudioMuted(!isAudioMuted, /* ensureTrack */ true));
}

function _getWatchConferenceURL(getState) {
    const { conferenceURL } = getState()['features/mobile/watchos'];

    return conferenceURL;
}

function _getConferenceUrlFromBaseConf(getState) {

    // FIXME probably authRequired and paswordRequired should be included
    // as well...
    // const conference = getCurrentConference(getState);
    // const conferenceURLObj = conference[JITSI_CONFERENCE_URL_KEY];
    const inviteUrl = getInviteURL(getState);

    // NOTE for some reason 'null' does not update context - must be string
    return inviteUrl ? inviteUrl : 'NULL';
}

function _updateApplicationContext(getState) {
    const context = getState()['features/mobile/watchos'];

    try {
        console.info('UPDATING WATCH CONTEXT', JSON.stringify(context));
        watch.updateApplicationContext(context);
    } catch (error) {
        console.error('Failed to stringify or send the context', error);
    }
}
