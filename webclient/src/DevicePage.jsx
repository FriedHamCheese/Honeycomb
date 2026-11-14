import {MainSideNavbar} from './mainSideNavbar.jsx';
import {ErrorPopup} from './Popups.jsx';

import {useState, useEffect, useMemo, useRef} from 'react';
import {useNavigate, useParams} from 'react-router';
import {BsCheckLg} from 'react-icons/bs';

import styles from './DevicePage.module.css';
import DashboardWidgets, {Label01} from './DashboardWidgets.jsx';
import {
  DASHBOARD_FRAME_HEIGHT_QUARTERS,
  DASHBOARD_FRAME_WIDTH_QUARTERS,
  MAX_DASHBOARD_WIDGET_COLUMN_NAME_CHARACTERS,
  MAX_DASHBOARD_WIDGET_ID,
  MAX_SUPPORTED_DASHBOARD_WIDGET_TYPE,
  MIN_DASHBOARD_WIDGET_COLUMN_NAME_CHARACTERS,
  MIN_DASHBOARD_WIDGET_ID,
  MIN_DASHBOARD_WIDGET_TYPE,
  MIN_DASHBOARD_WIDGET_HEIGHT_QUARTERS,
  MIN_DASHBOARD_WIDGET_WIDTH_QUARTERS,
  MIN_DASHBOARD_WIDGET_X_POSITION_QUARTERS,
  MIN_DASHBOARD_WIDGET_Y_POSITION_QUARTERS,
} from '../../constraints.js';

export default function DevicePage({
  APIBaseURL, URLToLoginPage, getUserSessionToken, clearUserSessionToken
}) {
  const linkParameters = useParams();  
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceObject, setDeviceObject] = useState();
  const [datapoints, setDatapoints] = useState();
  
  const [deviceDataLabels, setDeviceDataLabels] = useState([]);
  const [deviceRows, setDeviceRows] = useState([]);
  const [latestDatapoint, setLatestDatapoint] = useState();
  const [dashboardWidgets, setDashboardWidgets] = useState([]);
  const [savedDashboardWidgets, setSavedDashboardWidgets] = useState([]);
  const [refreshObject, setRefreshObject] = useState({});
  const [activeTab, setActiveTab] = useState('dataLog');
  const navigate = useNavigate();
  
  function DatapointContainer({datapoint}){
    return(
      <tr className={styles.tableRow}>
        {datapoint.map((dataElement, index) => <td key={index} className={styles.table}>{dataElement}</td>)}
      </tr>
    );
  }
  
  async function getDeviceInfo(){
    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/device/${linkParameters.deviceIDStr}`, {
        headers:{
          authorization: getUserSessionToken()
        }
      });
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Couldn't connect to server.");
      return setErrorMessage(String(err));
    }
    
    const invalidSessionToken = response.status === 401;
    if(invalidSessionToken) navigate(URLToLoginPage);
    
    if(!(response.ok))
      return setErrorMessage(`Received HTTP status ${response.status} from server.`);
    
    try{
      const objectFromResponse = await response.json();
      if(!(objectFromResponse.table instanceof Array))
        return setErrorMessage(".table attribute from server not array type.");

      setDeviceObject(objectFromResponse);
      if (objectFromResponse.table.length < 1)
        setDeviceDataLabels([]);
      else setDeviceDataLabels(Object.keys(objectFromResponse.table[0]));
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Could not read response.");
      if(err instanceof TypeError)
        return setErrorMessage("Cannot parse response as JSON.");
      return setErrorMessage(String(err));
    }
    setErrorMessage("");
  }
  
  function getDatapointsAlignedToDataLabels(deviceTable, dataLabels){
    const alignedDatapoints = [];
    for(const datapoint of deviceTable){
      if(!(datapoint instanceof Object)){
        console.log(`$Datapoint {datapoint} not Object, skipping...`);
        continue;
      }
      
      const alignedDatapoint = [];
      for(const dataLabel of dataLabels)
        alignedDatapoint.push(datapoint[dataLabel]); 
      alignedDatapoints.push(alignedDatapoint);
    }
    return alignedDatapoints;
  }
  
  const callOnRerender = [];
  useEffect(() => {getDeviceInfo()}, callOnRerender);

  useEffect(() => {
    const msPerRefresh = 2000;
    const timerID = setTimeout(function (){
      getDeviceInfo();
      setRefreshObject({});
    }, msPerRefresh);

    return function (){clearTimeout(timerID);}
  }, [refreshObject]);

  useEffect(() => {
    if(activeTab !== 'dashboard') return;

    let cancelled = false;
    async function getLatestDatapoint(){
      let response;
      try{
        response = await fetch(`${APIBaseURL}/apiv1/device/${linkParameters.deviceIDStr}/latest`, {
          headers: {authorization: getUserSessionToken()}
        });
      }catch(err){
        if(cancelled) return;
        if(err instanceof TypeError)
          return setErrorMessage("Couldn't connect to server.");
        return setErrorMessage(String(err));
      }

      if(response.status === 401){
        navigate(URLToLoginPage);
        return;
      }
      if(!response.ok){
        return setErrorMessage(`Received HTTP status ${response.status} from server.`);
      }

      try{
        const objectFromResponse = await response.json();
        if(!(objectFromResponse.datapoint === null || objectFromResponse.datapoint instanceof Object))
          return setErrorMessage("Server response .datapoint not Object or null.");
        if(!cancelled){
          setLatestDatapoint(objectFromResponse.datapoint);
          setErrorMessage("");
        }
      }catch(err){
        if(cancelled) return;
        if(err instanceof TypeError)
          return setErrorMessage("Could not read response.");
        if(err instanceof SyntaxError)
          return setErrorMessage("Cannot parse response as JSON.");
        return setErrorMessage(String(err));
      }
    }

    getLatestDatapoint();
    const timerID = setInterval(getLatestDatapoint, 5000);
    return () => {
      cancelled = true;
      clearInterval(timerID);
    };
  }, [activeTab, APIBaseURL, URLToLoginPage, getUserSessionToken, linkParameters.deviceIDStr, navigate]);

  useEffect(() => {
    if(activeTab !== 'dashboard') return;

    let cancelled = false;
    async function getDashboardWidgets(){
      let response;
      try{
        response = await fetch(`${APIBaseURL}/apiv1/dashboard/${linkParameters.deviceIDStr}`, {
          headers: {authorization: getUserSessionToken()}
        });
      }catch(err){
        if(cancelled) return;
        if(err instanceof TypeError)
          return setErrorMessage("Couldn't connect to server.");
        return setErrorMessage(String(err));
      }

      if(response.status === 401){
        navigate(URLToLoginPage);
        return;
      }
      if(!response.ok)
        return setErrorMessage(`Received HTTP status ${response.status} from server.`);

      try{
        const objectFromResponse = await response.json();
        if(!(objectFromResponse.widgets instanceof Array))
          return setErrorMessage("Server response .widgets attribute not Array.");
        if(!cancelled){
          setDashboardWidgets(objectFromResponse.widgets);
          setSavedDashboardWidgets(objectFromResponse.widgets);
        }
      }catch(err){
        if(cancelled) return;
        if(err instanceof TypeError)
          return setErrorMessage("Could not read response.");
        if(err instanceof SyntaxError)
          return setErrorMessage("Cannot parse response as JSON.");
        return setErrorMessage(String(err));
      }
    }

    getDashboardWidgets();
  }, [activeTab, APIBaseURL, URLToLoginPage, getUserSessionToken, linkParameters.deviceIDStr, navigate]);
  
  useEffect(() => {
    if(!deviceObject) return;
    if(!deviceObject.table !== datapoints)
      setDatapoints(deviceObject.table);
    
    setDeviceRows(getDatapointsAlignedToDataLabels(deviceObject.table, deviceDataLabels));
  }, [deviceObject])

  const DatapointsVisual = useMemo(function (){
    return deviceRows.map((datapoint) => <DatapointContainer datapoint={datapoint}/>)
  }, [deviceRows]);

  const nothingToDisplay = !deviceObject && !errorMessage;
  if(nothingToDisplay) return;
  
  return (
    <div>
      {<ErrorPopup text={errorMessage} closeSelf={async () => {
        setErrorMessage("");
        getDeviceInfo();
      }}/>}
      <MainSideNavbar 
        URLToLoginPage={URLToLoginPage} clearUserSessionToken={clearUserSessionToken}
      />
      {
        deviceObject && <div>
          <div className={styles.topbar}>
            <h1 className={styles.topbarTitle}>{deviceObject.deviceName}</h1>
            <p className={styles.deviceID}>device ID: {linkParameters.deviceIDStr}</p>
          </div>
          <div className={styles.canvas}>
            <div className={styles.tabs} role="tablist" aria-label="Device views">
              <button
                className={`${styles.tab} ${activeTab === 'dashboard' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('dashboard')}
                role="tab"
                aria-selected={activeTab === 'dashboard'}
                type="button"
              >
                Dashboard
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'dataLog' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('dataLog')}
                role="tab"
                aria-selected={activeTab === 'dataLog'}
                type="button"
              >
                Data Log
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'settings' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('settings')}
                role="tab"
                aria-selected={activeTab === 'settings'}
                type="button"
              >
                Settings
              </button>
            </div>

            <div className={`${styles.tabPanel} ${activeTab === 'dashboard' ? styles.dashboardPanel : ''}`}>
              {activeTab === 'dashboard' ? <div className={styles.dashboardTabContent}>
                <DashboardWorkspace
                  dashboardWidgets={dashboardWidgets}
                  setDashboardWidgets={setDashboardWidgets}
                  savedDashboardWidgets={savedDashboardWidgets}
                  setSavedDashboardWidgets={setSavedDashboardWidgets}
                  latestDatapoint={latestDatapoint}
                  APIBaseURL={APIBaseURL}
                  deviceID={linkParameters.deviceIDStr}
                  getUserSessionToken={getUserSessionToken}
                  URLToLoginPage={URLToLoginPage}
                  navigate={navigate}
                  setErrorMessage={setErrorMessage}
                />
              </div> : activeTab === 'dataLog' ? <>
                <table className={styles.dataTable}>
                  <thead>
                    <tr className={styles.tableHeaderRow}>
                      {deviceDataLabels.map((dataLabel) => <th key={dataLabel} className={styles.tableHeader}>{dataLabel}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {DatapointsVisual}
                  </tbody>
                </table>
              </> : <div className={styles.emptyTab}></div>}
            </div>
          </div>
        </div>
      }
    </div>
  );
}

function DashboardWorkspace({
  dashboardWidgets,
  setDashboardWidgets,
  savedDashboardWidgets,
  setSavedDashboardWidgets,
  latestDatapoint,
  APIBaseURL,
  deviceID,
  getUserSessionToken,
  URLToLoginPage,
  navigate,
  setErrorMessage,
}){
  const [dashboardEditMode, setDashboardEditMode] = useState(false);
  const [selectedDashboardWidget, setSelectedDashboardWidget] = useState();
  const [addingWidgetType, setAddingWidgetType] = useState();
  const [editorTab, setEditorTab] = useState('add');
  const dashboardFrameRef = useRef();
  const widgetsInSync = JSON.stringify(dashboardWidgets) === JSON.stringify(savedDashboardWidgets);

  async function saveDashboardWidgets(){
    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/dashboard/${deviceID}`, {
        method: 'POST',
        headers: {
          authorization: getUserSessionToken(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({widgets: dashboardWidgets}),
      });
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Couldn't connect to server.");
      return setErrorMessage(String(err));
    }

    if(response.status === 401){
      navigate(URLToLoginPage);
      return;
    }
    const invalidWidgetSettings = response.status === 400;
    if(invalidWidgetSettings){
      try{
        const objectFromResponse = await response.json();
        if(typeof objectFromResponse.error === 'string')
          return setErrorMessage(`${objectFromResponse.error} Changes made not saved to server.`);
        return setErrorMessage(`Server rejected the dashboard widgets.Changes made not saved to server.`);
      }catch(err){
        if(err instanceof TypeError)
          return setErrorMessage("Could not read response.");
        if(err instanceof SyntaxError)
          return setErrorMessage("Cannot parse server response as JSON.");
        return setErrorMessage(String(err));
      }
    }
    if(!response.ok)
      return setErrorMessage(`Received HTTP status ${response.status} from server.`);

    setErrorMessage('');
    setSavedDashboardWidgets(dashboardWidgets);
  }

  return <>
    <div className={`${styles.dashboardActions} ${dashboardEditMode ? styles.dashboardActionsEditing : ''}`}>
      <button
        className={styles.dashboardEditButton}
        onClick={() => {
          setDashboardEditMode(!dashboardEditMode);
          setSelectedDashboardWidget();
        }}
        type="button"
      >
        {dashboardEditMode ? 'Close editor' : 'Edit'}
      </button>
      { 
        dashboardEditMode &&
        <button className={styles.dashboardSaveButton} onClick={saveDashboardWidgets} type="button">
          Save
        </button>
      }
      {dashboardEditMode && widgetsInSync && <BsCheckLg className={styles.dashboardSavedIcon} title="Dashboard saved" aria-label="Dashboard saved" />}
    </div>
    <div className={styles.dashboardWorkspace}>
      {dashboardEditMode && <DashboardWidgetEditor
        dashboardWidgets={dashboardWidgets}
        setDashboardWidgets={setDashboardWidgets}
        selectedDashboardWidget={selectedDashboardWidget}
        setSelectedDashboardWidget={setSelectedDashboardWidget}
        addingWidgetType={addingWidgetType}
        setAddingWidgetType={setAddingWidgetType}
        editorTab={editorTab}
        setEditorTab={setEditorTab}
        latestDatapoint={latestDatapoint}
      />}
      <div
        className={styles.dashboardFrame}
        ref={dashboardFrameRef}
        onClick={(event) => {
          if(addingWidgetType === undefined || event.target !== dashboardFrameRef.current) return;
          const frame = dashboardFrameRef.current.getBoundingClientRect();
          const nextWidgetId = dashboardWidgets.reduce(
            (highestId, widget) => Math.max(highestId, widget.widgetId), -1
          ) + 1;
          const newWidget = {
            widgetId: nextWidgetId,
            widgetType: addingWidgetType,
            columnName: 'temperature_celsius',
            xpos_quarters: Math.min(3, Math.max(0, Math.round((event.clientX - frame.left) / frame.width * 4))),
            ypos_quarters: Math.min(7, Math.max(0, Math.round((event.clientY - frame.top) / frame.height * 8))),
            width_quarters: 1,
            height_quarters: 1,
          };
          setDashboardWidgets([...dashboardWidgets, newWidget]);
          setSelectedDashboardWidget(newWidget);
          setEditorTab('properties');
          setAddingWidgetType(undefined);
        }}
      >
      <DashboardWidgets
          widgets={dashboardWidgets}
          latestDatapoint={latestDatapoint}
          editing={dashboardEditMode}
        onWidgetClick={(widget) => {
          setSelectedDashboardWidget(widget);
          setEditorTab('properties');
          setAddingWidgetType(undefined);
        }}
        />
      </div>
    </div>
  </>;
}

function DashboardWidgetEditor({
  dashboardWidgets,
  setDashboardWidgets,
  selectedDashboardWidget,
  setSelectedDashboardWidget,
  addingWidgetType,
  setAddingWidgetType,
  editorTab,
  setEditorTab,
  latestDatapoint,
}){
  function updateWidget(propertyName, value, valueConstraints){
    const [minimum, maximum] = valueConstraints;
    const valueForComparison = typeof value === 'string' ? value.length : value;
    if((minimum !== null && valueForComparison < minimum) || (maximum !== null && valueForComparison > maximum))
      return;

    const updatedWidget = {...selectedDashboardWidget, [propertyName]: value};
    setSelectedDashboardWidget(updatedWidget);
    setDashboardWidgets(dashboardWidgets.map((widget) => (
      widget.widgetId === selectedDashboardWidget.widgetId ? updatedWidget : widget
    )));
  }

  return <div className={styles.dashboardEditor}>
    <div className={styles.dashboardEditorTabs}>
      <button
        className={`${styles.dashboardEditorTab} ${editorTab === 'add' ? styles.dashboardEditorTabSelected : ''}`}
        onClick={() => {
          setEditorTab('add');
          setSelectedDashboardWidget();
        }}
        type="button"
      >Add</button>
      <button
        className={`${styles.dashboardEditorTab} ${editorTab === 'properties' ? styles.dashboardEditorTabSelected : ''}`}
        onClick={() => setEditorTab('properties')}
        type="button"
      >Properties</button>
    </div>
    {editorTab === 'properties' ? <>
      <h3 className={styles.dashboardEditorTitle}>Widget properties</h3>
      {selectedDashboardWidget ? <>
        {[
          ['widgetType', 'Type', false, [MIN_DASHBOARD_WIDGET_TYPE, MAX_SUPPORTED_DASHBOARD_WIDGET_TYPE]],
          ['columnName', 'Column', true, [MIN_DASHBOARD_WIDGET_COLUMN_NAME_CHARACTERS, MAX_DASHBOARD_WIDGET_COLUMN_NAME_CHARACTERS]],
          ['widgetId', 'Widget ID', false, [MIN_DASHBOARD_WIDGET_ID, MAX_DASHBOARD_WIDGET_ID]],
          ['xpos_quarters', 'X position', false, [MIN_DASHBOARD_WIDGET_X_POSITION_QUARTERS, DASHBOARD_FRAME_WIDTH_QUARTERS - 1]],
          ['ypos_quarters', 'Y position', false, [MIN_DASHBOARD_WIDGET_Y_POSITION_QUARTERS, DASHBOARD_FRAME_HEIGHT_QUARTERS - 1]],
          ['width_quarters', 'Width', false, [MIN_DASHBOARD_WIDGET_WIDTH_QUARTERS, DASHBOARD_FRAME_WIDTH_QUARTERS]],
          ['height_quarters', 'Height', false, [MIN_DASHBOARD_WIDGET_HEIGHT_QUARTERS, DASHBOARD_FRAME_HEIGHT_QUARTERS]],
        ].map(([propertyName, label, isText, valueConstraints]) => <label className={styles.dashboardEditorProperty} key={propertyName}>
          <span>{label}</span>
          <input
            type={isText ? 'text' : 'number'}
            value={selectedDashboardWidget[propertyName]}
              readOnly={propertyName === 'widgetId'}
            onChange={(event) => updateWidget(propertyName, isText ? event.target.value : Number(event.target.value), valueConstraints)}
          />
        </label>)}
        <button
          className={styles.dashboardEditorAction}
          onClick={() => {
            setDashboardWidgets(dashboardWidgets.filter((widget) => widget.widgetId !== selectedDashboardWidget.widgetId));
            setSelectedDashboardWidget();
          }}
          type="button"
        >
          Delete widget
        </button>
      </> : <p className={styles.dashboardEditorHint}>Select a widget in the frame to inspect its properties.</p>}
    </> : <>
      <h3 className={styles.dashboardEditorTitle}>Add widget</h3>
      <div
        className={`${styles.dashboardWidgetPreview} ${addingWidgetType === 0 ? styles.dashboardWidgetPreviewSelected : ''}`}
        onClick={() => setAddingWidgetType(addingWidgetType === 0 ? undefined : 0)}
        role="button"
        tabIndex="0"
        onKeyDown={(event) => {
          if(event.key === 'Enter' || event.key === ' ')
            setAddingWidgetType(addingWidgetType === 0 ? undefined : 0);
        }}
      >
        <Label01
          widget={{
            widgetId: -1,
            widgetType: 0,
            columnName: 'Label 01',
            xpos_quarters: 0,
            ypos_quarters: 0,
            width_quarters: 4,
            height_quarters: 1,
            previewValue: 27,
          }}
          editing
          onWidgetClick={() => setAddingWidgetType(addingWidgetType === 0 ? undefined : 0)}
          isSelected={addingWidgetType === 0}
          preview
        />
      </div>
      <p className={styles.dashboardEditorHint}>
        {addingWidgetType === 0 ? 'Click an empty spot in the frame to place it.' : 'Select a widget type, then click the frame.'}
      </p>
    </>}
  </div>;
}
