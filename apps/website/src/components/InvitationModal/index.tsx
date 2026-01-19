import React, { useCallback, useContext, useState, useMemo } from 'react';
import { Tooltip as ReactTooltip } from 'react-tooltip';
import {
  faAngleDown,
  faAngleUp,
  faCheck,
  faCircle,
  faClose,
  faLink,
  faXmark,
  faXmarkCircle,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import axios, { AxiosResponse } from 'axios';
import copy from 'copy-to-clipboard';

import { FriendShareData } from '../../data/types';
import { ScheduleContext } from '../../contexts';
import { DESKTOP_BREAKPOINT, CLOUD_FUNCTION_BASE_URL } from '../../constants';
import useScreenWidth from '../../hooks/useScreenWidth';
import { classes } from '../../utils/misc';
import Modal from '../Modal';
import Button from '../Button';
import { AccountContext, SignedIn } from '../../contexts/account';
import { ErrorWithFields, softError } from '../../log';
import Spinner from '../Spinner';
import { ScheduleDeletionRequest } from '../../types';
import useDeepCompareEffect from '../../hooks/useDeepCompareEffect';

import './stylesheet.scss';

/**
 * Inner content of the invitation modal.
 */
export function InvitationModalContent(): React.ReactElement {
  const [removeInvitationOpen, setRemoveInvitationOpen] = useState(false);
  const [toRemoveInfo, setToRemoveInfo] = useState({
    version: { id: '', name: '' },
    friendId: '',
  });
  const [otherSchedulesVisible, setOtherSchedulesVisible] = useState(false);
  const [expirationDropdownVisible, setExpirationDropdownVisible] =
    useState(false);
  const [selectedExpiration, setSelectedExpiration] = useState('Never');

  // All choices sent in seconds
  const expirationChoices = useMemo(
    (): Record<string, number> => ({
      Never: 356 * 24 * 3600,
      '1 week': 7 * 24 * 3600,
      '1 day': 24 * 3600,
      '1 hour': 3600,
    }),
    []
  );

  const [{ currentVersion, term, allVersionNames, allFriends }] =
    useContext(ScheduleContext);
  const accountContext = useContext(AccountContext);
  const mobile = !useScreenWidth(DESKTOP_BREAKPOINT);

  const [linkButtonClassName, setLinkButtonClassName] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [checkedSchedules, setCheckedSchedules] = useState([currentVersion]);

  const redirectURL = useMemo(
    () => window.location.href.split('/#')[0] ?? '/',
    []
  );

  const getInvitationLink = useCallback(async (): Promise<
    AxiosResponse<{ link: string }>
  > => {
    const IdToken = await (accountContext as SignedIn).getToken();
    const data = JSON.stringify({
      IDToken: IdToken,
      term,
      versions: checkedSchedules,
      redirectURL,
      validFor: expirationChoices[selectedExpiration],
    });
    return axios.post(
      `${CLOUD_FUNCTION_BASE_URL}/createFriendInvitationLink`,
      `data=${data}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
  }, [
    accountContext,
    term,
    redirectURL,
    checkedSchedules,
    expirationChoices,
    selectedExpiration,
  ]);

  const createLink = useCallback(async (): Promise<void> => {
    setLinkLoading(true);
    setLinkButtonClassName('');
    await getInvitationLink()
      .then((response) => {
        copy(response.data.link);
      })
      .catch((err) => {
        setLinkButtonClassName('link-failure');
        softError(
          new ErrorWithFields({
            message: 'invite link creation failed',
            source: err,
            fields: {
              user: (accountContext as SignedIn).id,
              term,
              versionIds: checkedSchedules,
              validFor: selectedExpiration,
            },
          })
        );
        throw err;
      });
  }, [
    accountContext,
    term,
    getInvitationLink,
    checkedSchedules,
    selectedExpiration,
  ]);

  // delete invitation or remove schedules from already accepted invitation
  const handleDelete = useCallback(
    async (versionId: string, friendId: string): Promise<void> => {
      const data = JSON.stringify({
        IDToken: await (accountContext as SignedIn).getToken(),
        peerUserId: friendId,
        term,
        versions: [versionId],
        owner: true,
      } as ScheduleDeletionRequest);
      axios
        .post(
          `${CLOUD_FUNCTION_BASE_URL}/deleteSharedSchedule`,
          `data=${data}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          }
        )
        .catch((err) => {
          throw err;
        });
    },
    [accountContext, term]
  );

  function showRemoveInvitation(
    version: { id: string; name: string },
    friendId: string
  ): void {
    setRemoveInvitationOpen(true);
    setToRemoveInfo({ version, friendId });
  }

  // delete friend from record of friends and close modal
  const hideRemoveInvitation = useCallback(
    (confirm: boolean) => {
      setRemoveInvitationOpen(false);
      if (confirm) {
        handleDelete(toRemoveInfo.version.id, toRemoveInfo.friendId).catch(
          (err) => {
            softError(
              new ErrorWithFields({
                message: 'delete friend record from sender failed',
                source: err,
                fields: {
                  user: (accountContext as SignedIn).id,
                  friend: toRemoveInfo.friendId,
                  term,
                  version: toRemoveInfo.version.id,
                },
              })
            );
          }
        );
      }
    },
    [toRemoveInfo, handleDelete, accountContext, term]
  );

  // show a fake loader when options change
  useDeepCompareEffect(() => {
    setLinkButtonClassName('');
    setLinkLoading(true);
    setTimeout(() => {
      setLinkLoading(false);
    }, 200);
  }, [checkedSchedules, selectedExpiration]);

  return (
    <div className={classes('invitation-modal-content', mobile && 'mobile')}>
      <div className="top-block">
        <p className="modal-title">Share Schedule</p>
        <p>
          Share your schedule with friends by generating a link. Anyone with the
          link can view your selected schedule(s) in their UIUC Scheduler
          account.
        </p>
        <div className="share-schedule-checkboxes">
          {allVersionNames.slice(0, 3).map((v) => (
            <ShareScheduleCheckbox
              checkedSchedules={checkedSchedules}
              version={v}
              setCheckedSchedules={setCheckedSchedules}
              isOther={false}
            />
          ))}
          {allVersionNames.length > 3 && (
            <div>
              <div
                className="other-schedules-button"
                onClick={(): void =>
                  setOtherSchedulesVisible(!otherSchedulesVisible)
                }
              >
                <p className="other-schedules-text">Other</p>
                <FontAwesomeIcon
                  icon={otherSchedulesVisible ? faAngleUp : faAngleDown}
                />
              </div>
              {otherSchedulesVisible && (
                <div
                  className="intercept"
                  onClick={(): void => setOtherSchedulesVisible(false)}
                />
              )}
              <div className="other-schedules-list">
                {otherSchedulesVisible &&
                  allVersionNames
                    .slice(3)
                    .map((v) => (
                      <ShareScheduleCheckbox
                        checkedSchedules={checkedSchedules}
                        version={v}
                        setCheckedSchedules={setCheckedSchedules}
                        isOther
                      />
                    ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <hr className="divider" />
      <div className="invited-users">
        {allVersionNames.map((v) => {
          return (
            <div>
              <p>
                Users Invited to View <strong>{v.name}</strong>
              </p>
              {allFriends[v.id] &&
              Object.keys(allFriends[v.id] as Record<string, FriendShareData>)
                .length !== 0 ? (
                <div className="shared-emails" key="email">
                  {Object.entries(
                    allFriends[v.id] as Record<string, FriendShareData>
                  ).map(([friendId, friend]) => (
                    <div className="email-and-status" id={friend.email}>
                      <div
                        className={classes(
                          'individual-shared-email',
                          friend.status
                        )}
                      >
                        <p className="email-text">{friend.email}</p>
                        <Button
                          className="button-remove"
                          onClick={(): void => {
                            showRemoveInvitation(v, friendId);
                          }}
                        >
                          <FontAwesomeIcon className="circle" icon={faCircle} />
                          <FontAwesomeIcon className="remove" icon={faClose} />
                        </Button>
                        <ReactTooltip
                          anchorId={friend.email}
                          className="status-tooltip"
                          variant="dark"
                          place="top"
                          offset={2}
                        >
                          Status: {friend.status}
                        </ReactTooltip>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-invited-users">
                  No friends have been invited
                </div>
              )}{' '}
            </div>
          );
        })}
      </div>
      <hr className="divider" />
      <div className="modal-footer">
        <div className="link-options">
          <button
            type="button"
            className={classes(
              'copy-link-button',
              linkLoading ? '' : 'link-generated',
              linkButtonClassName
            )}
            disabled={linkLoading}
            onClick={(): void => {
              createLink()
                .then(() => {
                  setLinkButtonClassName('link-success');
                  setLinkLoading(false);
                })
                .catch(() => {
                  setLinkButtonClassName('link-failure');
                  setLinkLoading(false);
                });
            }}
          >
            <div
              className={classes('link-icon-container', linkButtonClassName)}
            >
              {linkLoading && <Spinner className="link-spinner" size="small" />}
              {!linkLoading && linkButtonClassName === '' && (
                <FontAwesomeIcon icon={faLink} />
              )}
              {!linkLoading && linkButtonClassName === 'link-success' && (
                <FontAwesomeIcon icon={faCircleCheck} />
              )}
              {!linkLoading && linkButtonClassName === 'link-failure' && (
                <FontAwesomeIcon icon={faXmarkCircle} />
              )}
            </div>
            <text className={linkButtonClassName}>
              {linkButtonClassName === '' && 'Share with link'}
              {linkButtonClassName === 'link-success' && 'Link copied!'}
              {linkButtonClassName === 'link-failure' && 'Error occurred'}
            </text>
          </button>
          <div className="expiration">
            <div className="expiration-display">
              <text>Link expires:</text>
              <div
                className="current-expiration"
                onClick={(): void => {
                  setExpirationDropdownVisible(!expirationDropdownVisible);
                }}
              >
                <text>{selectedExpiration}</text>
                <FontAwesomeIcon
                  icon={expirationDropdownVisible ? faAngleDown : faAngleUp}
                />
              </div>
            </div>
            {expirationDropdownVisible && (
              <div
                className="intercept"
                onClick={(): void => setExpirationDropdownVisible(false)}
              />
            )}
            <div className="expiration-select">
              {expirationDropdownVisible &&
                Object.keys(expirationChoices).map((exp) => (
                  <text
                    className="expiration-option"
                    onClick={(): void => {
                      setSelectedExpiration(exp);
                      setExpirationDropdownVisible(false);
                    }}
                  >
                    {exp}
                  </text>
                ))}
            </div>
          </div>
        </div>
      </div>
      <RemoveInvitationModal
        showRemove={removeInvitationOpen}
        onHideRemove={hideRemoveInvitation}
        versionName={toRemoveInfo.version.name}
        currentInvitee={
          toRemoveInfo.version.id === ''
            ? ''
            : (
                allFriends[toRemoveInfo.version.id] as Record<
                  string,
                  FriendShareData
                >
              )[toRemoveInfo.friendId]?.email ?? ''
        }
      />
    </div>
  );
}

export type RemoveInvitationModalContentProps = {
  versionName: string;
  currentInvitee: string;
};

export function RemoveInvitationModalContent({
  versionName,
  currentInvitee,
}: RemoveInvitationModalContentProps): React.ReactElement {
  return (
    <div className="remove-invitation-modal-content">
      <div>
        <h2>Remove Access</h2>
        <p>
          Are you sure you want to remove the following user from having access
          schedule: <b>{versionName}</b>?
        </p>
        <p>
          User: <b>{currentInvitee}</b>
        </p>
        <p>
          This user will only gain access to this schedule if you send them
          another invitation
        </p>
      </div>
    </div>
  );
}

export type InvitationModalProps = {
  show: boolean;
  onHide: () => void;
};

/**
 * Component that can be used to show the invitaion modal.
 */
export default function InvitationModal({
  show,
  onHide,
}: InvitationModalProps): React.ReactElement {
  return (
    <Modal
      show={show}
      className="invitation-modal"
      onHide={onHide}
      buttons={[]}
      width={550}
    >
      <Button className="remove-close-button" onClick={onHide}>
        <FontAwesomeIcon icon={faXmark} size="xl" />
      </Button>
      <InvitationModalContent />
    </Modal>
  );
}

export type RemoveInvitationModalProps = {
  showRemove: boolean;
  onHideRemove: (confirm: boolean) => void;
  versionName: string;
  currentInvitee: string;
};

function RemoveInvitationModal({
  showRemove,
  onHideRemove,
  versionName,
  currentInvitee,
}: RemoveInvitationModalProps): React.ReactElement {
  return (
    <Modal
      show={showRemove}
      className="remove-invitation-modal"
      onHide={(): void => onHideRemove(false)}
      buttons={[
        { label: 'Remove', onClick: () => onHideRemove(true), cancel: true },
      ]}
      width={550}
    >
      <Button
        className="remove-close-button"
        onClick={(): void => onHideRemove(false)}
      >
        <FontAwesomeIcon icon={faXmark} size="xl" />
      </Button>
      <RemoveInvitationModalContent
        versionName={versionName}
        currentInvitee={currentInvitee}
      />
    </Modal>
  );
}

export type ShareScheduleCheckboxProps = {
  checkedSchedules: string[];
  setCheckedSchedules: React.Dispatch<React.SetStateAction<string[]>>;
  version: { id: string; name: string };
  isOther: boolean;
};

function ShareScheduleCheckbox({
  checkedSchedules,
  setCheckedSchedules,
  version,
  isOther,
}: ShareScheduleCheckboxProps): React.ReactElement {
  return (
    <div
      className={
        isOther
          ? classes('checkbox-and-label', 'other-checkbox-and-label')
          : 'checkbox-and-label'
      }
      onClick={(): void => {
        const newChecked = checkedSchedules;
        if (!newChecked.includes(version.id)) {
          newChecked.push(version.id);
        } else if (newChecked.length > 1) {
          newChecked.splice(newChecked.indexOf(version.id), 1);
        }
        setCheckedSchedules([...newChecked]);
      }}
    >
      <FontAwesomeIcon
        className={
          checkedSchedules.includes(version.id)
            ? classes('share-schedule-checkbox', version.id, 'schedule-checked')
            : classes('share-schedule-checkbox', version.id)
        }
        icon={faCheck}
      />
      <p className="checkbox-label">{version.name}</p>
    </div>
  );
}
