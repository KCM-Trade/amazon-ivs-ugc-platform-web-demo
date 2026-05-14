import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import { Outlet } from 'react-router-dom';
import useSWR from 'swr';

import { channelAPI } from '../api';
import { getAvatarSrc } from '../helpers';
import { getCurrentSession } from '../api/utils';
import { pack, unpack } from '../helpers/streamActionHelpers';
import useContextHook from './useContextHook';
import useCurrentPage from '../hooks/useCurrentPage';
import useLocalStorage from '../hooks/useLocalStorage';
import usePrevious from '../hooks/usePrevious';

const Context = createContext(null);
Context.displayName = 'User';

const getCurrentSessionFetcher = async () => {
  const { result: data, error } = await getCurrentSession();

  if (error) throw error;

  return data;
};

const stripNeedsChannelConfigSync = (payload) => {
  if (!payload) return payload;
  const { needsChannelConfigSync, ...rest } = payload;

  return rest;
};

export const Provider = () => {
  const [isProvisioningResources, setIsProvisioningResources] = useState(false);
  const [hasErrorProvisioningResources, setHasErrorProvisioningResources] =
    useState(false);
  const [userData, setUserData] = useState();
  const [hasFetchedInitialUserData, setHasFetchedInitialUserData] =
    useState(false);
  const [isSessionValid, setIsSessionValid] = useState();
  const [logOutAction, setLogOutAction] = useState('');
  const [hasErrorFetchingFollowingList, setHasErrorFetchingFollowingList] =
    useState(false);
  const prevIsSessionValid = usePrevious(isSessionValid);
  const avatarSrc = getAvatarSrc(userData);

  const currentPage = useCurrentPage();
  const hasUserData = !!userData;

  const { remove: removeStoredUserData } = useLocalStorage({
    key: userData?.username,
    options: { keyPrefix: 'user', serialize: pack, deserialize: unpack }
  });

  const {
    data: session,
    mutate: checkSessionStatus, // mutate forces refetching the data, we use it after login and after logout
    error
  } = useSWR('getCurrentSession', getCurrentSessionFetcher);

  const fetchUserData = useCallback(async () => {
    const { result } = await channelAPI.getUserData();

    setHasFetchedInitialUserData(true);

    if (!result) {
      return undefined;
    }

    let next = result;

    if (next.needsChannelConfigSync) {
      const { error } = await channelAPI.updateChannelConfig();

      if (!error) {
        const { result: refreshed } = await channelAPI.getUserData();

        if (refreshed) {
          next = refreshed;
        }
      }
    }

    const safeForState = stripNeedsChannelConfigSync(next);

    if (safeForState) {
      setUserData((prevUserData) =>
        JSON.stringify(safeForState) === JSON.stringify(prevUserData)
          ? prevUserData
          : safeForState
      );
    }

    return stripNeedsChannelConfigSync(next);
  }, []);

  const fetchUserFollowingList = useCallback(async () => {
    setHasErrorFetchingFollowingList(false);
    setUserData((prevUserData) => ({
      ...prevUserData,
      followingList: undefined
    }));
    const { result, error } = await channelAPI.getUserFollowingListData();

    if (result) {
      setUserData((prevUserData) => ({
        ...prevUserData,
        followingList: result.channels
      }));
    }
    if (error) setHasErrorFetchingFollowingList(true);
  }, []);

  // Initialize or update user resources
  const initUserResources = useCallback(async () => {
    const userData = await fetchUserData();

    setIsProvisioningResources(true);
    setHasErrorProvisioningResources(false);

    let result, error;

    if (userData) {
      ({ result, error } = await channelAPI.updateChannelConfig());
    } else {
      ({ result, error } = await channelAPI.createResources());
    }

    if (result) await fetchUserData();
    if (error) setHasErrorProvisioningResources(true);

    setIsProvisioningResources(false);
  }, [fetchUserData]);

  const logOut = useCallback(
    (action) => {
      setLogOutAction(action);
      channelAPI.signOut();
      checkSessionStatus();
      setUserData(null);
      setHasFetchedInitialUserData(false);
    },
    [checkSessionStatus]
  );

  // Initial session check on page load
  useEffect(() => {
    if (error) {
      setIsSessionValid(false);
    } else if (session !== undefined) {
      setIsSessionValid(!!session);
    }
  }, [error, session]);

  // Initial fetch of the user data
  useEffect(() => {
    if (!userData && isSessionValid) {
      fetchUserData();
    }
  }, [fetchUserData, isSessionValid, userData]);

  // Remove all stored user data when the session becomes invalid
  // (i.e. user logs out, user session expires, etc.)
  useEffect(() => {
    if (isSessionValid === false) {
      removeStoredUserData(true);
    }
  }, [isSessionValid, removeStoredUserData]);

  useEffect(() => {
    if (
      hasUserData &&
      ['channel_directory', 'following'].includes(currentPage)
    ) {
      fetchUserFollowingList();
    }
  }, [currentPage, fetchUserFollowingList, hasUserData]);

  const value = useMemo(
    () => ({
      checkSessionStatus,
      fetchUserData,
      fetchUserFollowingList,
      hasErrorProvisioningResources,
      hasErrorFetchingFollowingList,
      hasFetchedInitialUserData,
      initUserResources,
      isProvisioningResources,
      isSessionValid,
      logOut,
      logOutAction,
      prevIsSessionValid,
      userData: userData && { ...userData, avatarSrc }
    }),
    [
      avatarSrc,
      checkSessionStatus,
      fetchUserData,
      fetchUserFollowingList,
      hasErrorProvisioningResources,
      hasErrorFetchingFollowingList,
      hasFetchedInitialUserData,
      initUserResources,
      isProvisioningResources,
      isSessionValid,
      logOut,
      logOutAction,
      prevIsSessionValid,
      userData
    ]
  );

  return (
    <Context.Provider value={value}>
      <Outlet />
    </Context.Provider>
  );
};

export const useUser = () => useContextHook(Context);
