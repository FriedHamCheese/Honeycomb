import { createRoot } from 'react-dom/client'
import {BrowserRouter, Routes, Route, Navigate} from 'react-router'
import Home from './Home.jsx'
import DevicePage from './DevicePage.jsx'

const paramsForMainSideNavbar = {
  relativeLinkToHome: "/home",
};

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path='/' element={<Navigate to="/home"/>}/>
      <Route path='/home' element={
      <Home 
        APIBaseURL="http://localhost:5001"
        selectedPage="devices" 
        baseRedirectToDeviceLink="/device/" 
        paramsForMainSideNavbar={paramsForMainSideNavbar}
      />}/>
      <Route path='device/:deviceIDStr' element={
        <DevicePage
          APIBaseURL="http://localhost:5001"
          selectedPage="devices" 
          paramsForMainSideNavbar={paramsForMainSideNavbar}
      />}/>
    </Routes>
  </BrowserRouter>
)
