// @flow
import React, { useState, useContext, useEffect } from 'react';

// Get the EditorContext
const EditorContext = React.createContext();

export const FORM_STATE_BUSY = 'busy';
export const FORM_STATE_NORMAL = 'normal';
export const FORM_STATE_ERROR = 'error';

type FormStates = FORM_STATE_NORMAL | FORM_STATE_BUSY | FORM_STATE_ERROR;

function createManager(initialState, parent, onChange, onSubmit) {
  let state = initialState;
  let formState: FormStates = FORM_STATE_NORMAL;
  const namedSubscriptions = {};
  const mappedSubscriptions = [];
  const validators = [];

  let requiresSubmit = 0;

  const manager = {
    getParent: () => parent,
    getState: () => state,
    getFormState: () => formState,
    dispatch: (name, value) => {
      const newValue = typeof value === 'function' ? value(state[name]) : value;
      const prevValue = state[name];
      if (prevValue === newValue) {
        return;
      }

      const newState = Array.isArray(state) ? state.slice() : Object.assign({}, state);
      newState[name] = newValue;
      state = newState;

      // let all the listeners know that the value has changed
      const subscriptions = namedSubscriptions[name];
      if (subscriptions && subscriptions.length > 0) {
        subscriptions.forEach(fn => fn(newValue));
      }

      mappedSubscriptions.forEach(([listener, mapper]) => listener(mapper(newState)));

      // Trigger the on change event
      if (!requiresSubmit) {
        onChange(newState);
      }
    },
    subscribe: (name, listener) => {
      if (typeof name === 'function') {
        const tuple = [listener, name];
        mappedSubscriptions.push(tuple);
        return () => {
          const idx = mappedSubscriptions.indexOf(tuple);
          mappedSubscriptions.splice(idx, 1);
        };
      }

      const arr = namedSubscriptions[name] || [];
      if (!arr.length) {
        namedSubscriptions[name] = arr;
      }
      arr.push(listener);

      return () => {
        const idx = arr.indexOf(listener);
        arr.splice(idx, 1);
        if (arr.length === 0) {
          delete namedSubscriptions[name];
        }
      };
    },
    validate: (check, fn) => {
      const validation = {
        done: null,
        confirm: () => {
          if (validation.done !== null) {
            return validation.done;
          }
          return validation.run(typeof check === 'function' ? check(state) : state[check]);
        },
        run: (value) => {
          validation.done = fn(value);
          return validation.done;
        },
        remove: () => {
          const idx = validators.indexOf(validation);
          if (idx >= 0) {
            validators.splice(idx, 1);
          }
        },
      };
      validators.push(validation);
      return validation;
    },
    registerSubmit: () => {
      requiresSubmit += 1;
      return () => { requiresSubmit -= 1; };
    },
    submit: async () => {
      // Run all the validators
      try {
        formState = FORM_STATE_BUSY;
        const res = await Promise.all(validators.map(v => v.confirm()));
        if (res.reduce((r, d) => r || d === false, false)) {
          formState = FORM_STATE_ERROR;
          return false;
        }
        formState = FORM_STATE_NORMAL;
        onChange(state);
        if (onSubmit) onSubmit(state);
        return true;
      } catch (err) {
        formState = FORM_STATE_ERROR;
        return false;
      }
    },
  };

  return manager;
}

export function useEditor(parent = null) {
  const instance = useContext(EditorContext);
  return parent || instance;
}

type Props = {
  value: {},
  onChange: ({}) => void,
  onSubmit: ?({}) => void,
  parent: ?{},
};

export default function Editor({ value, onChange, onSubmit, parent, ...other }: Props) {
  const [instance, setInstance] = useState(null);
  useEffect(() => {
    if (instance !== null) {
      // eslint-disable-next-line no-console
      console.warn('The editor onChange parameter is not expected to change');
    }

    setInstance(createManager(value, parent, onChange, onSubmit));

    // The useEffect hook is expected to be called only once,
    // hence, a warning above and dependency on `onChange` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange]);

  if (instance === null) {
    return null;
  }

  return <EditorContext.Provider value={instance} {...other} />;
}
