import { SET_CONFERENCE_URL } from './actionTypes';

/**
 * FIXME.
 *
 * @param {string} conferenceURL - FIXME.
 * @returns {{type, conferenceURL: *}}
 */
export function setConferenceURL(conferenceURL) {
    return {
        type: SET_CONFERENCE_URL,
        conferenceURL
    };
}
