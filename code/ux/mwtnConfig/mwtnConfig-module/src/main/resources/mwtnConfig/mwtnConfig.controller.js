/*
 * Copyright (c) 2016 highstreet technologies GmbH and others.  All rights reserved.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v1.0 which accompanies this distribution,
 * and is available at http://www.eclipse.org/legal/epl-v10.html
 */

define(['app/mwtnConfig/mwtnConfig.module',
        'app/mwtnConfig/mwtnConfig.services',
        'app/mwtnConfig/mwtnConfig.directives'],
        function(mwtnConfigApp) {

  mwtnConfigApp.register.controller('mwtnConfigCtrl', ['$uibModal', '$scope', '$rootScope', '$q', '$filter', '$mwtnLog', '$mwtnConfig', 'OnfNetworkElement','LogicalTerminationPoint',  
                                                       function($uibModal, $scope, $rootScope, $q, $filter, $mwtnLog, $mwtnConfig, OnfNetworkElement,LogicalTerminationPoint) {

    var COMPONENT = 'mwtnConfigCtrl';
    $mwtnLog.info({component: COMPONENT, message: 'mwtnConfigCtrl started!'});

    $rootScope.section_logo = 'src/app/mwtnConfig/images/mwtnConfig.png'; // Add your topbar logo location here such as 'assets/images/logo_topology.gif'
    $scope.parts = $mwtnConfig.parts;
    
     var pacTemplate = {
        'layer-protocol': 'unknown'           
    };
    
    //todo: remove
    var initPac = {
        layerProtocol: 'unknown'              
    };
    $scope.parts.map(function(part){
      initPac[part] = {info: 'Waiting...'};
    });
    $scope.schema = {init:false};
    $mwtnConfig.getSchema().then(function(data){
      $scope.schema = data;
    }, function(error){
      console.log('bad luck - no schema ;( ');
    });
    $scope.path = {};
    
    $scope.loading = false;
    $scope.unexpected = false;
    
    var initNodeList = function(mountpoints){
      $scope.loading = true;
      $scope.mountPoints = mountpoints;
      $scope.networkElements = mountpoints.filter(function(mountpoint){
        return mountpoint['netconf-node-topology:connection-status'] === 'connected';
      }).map(function(mountpoint){
        return {id:mountpoint['node-id'], revision:mountpoint.onfAirInterfaceRevision};  
      }).sort(function(a, b){
        if(a.id < b.id) return -1;
        if(a.id > b.id) return 1;
        return 0;
      });
        
        // select one of the nodes
      var select = parseInt(Math.random()*$scope.networkElements.length);
      console.log('slect', select);
      if (select) {
        $scope.networkElement = $scope.networkElements[select].id; 
        $scope.mountpoint = $scope.mountPoints.filter(function(mountpoint){
          return mountpoint['node-id'] === $scope.networkElement;
        })[0];
      }
      $scope.loading = false;
    };

    $scope.getType = $mwtnConfig.getType;
    $scope.neCurrentProblemsGridOptions = JSON.parse(JSON.stringify($mwtnConfig.gridOptions));
    $scope.highlightFilteredHeader = $mwtnConfig.highlightFilteredHeader;
    
    
    $mwtnConfig.getMountPoints().then(function(mountpoints){
      initNodeList(mountpoints);
    }, function(error){
      $scope.networkElements = [];
    });
    
    var order = $mwtnConfig.layerProtocolNameOrder;

    var updateNe = function(data) {
      if (!data) return;
      // update onfNetworkElement
      switch (data.revision) {
      case '2016-03-23':
        $scope.onfNetworkElement = JSON.parse(JSON.stringify(data['network-element'][0]));
        $scope.onfLtps = data['network-element'][0].ltp;
        $scope.onfNetworkElement.ltp = undefined;
        break;
      case '2016-08-09':
      case '2016-08-11':
      case '2017-02-17':
      case '2017-03-20':
      case '2017-03-24':
        // console.log(JSON.stringify(data));
        $scope.onfNetworkElement = new OnfNetworkElement(data['network-element']);
        $scope.onfLtps = $scope.onfNetworkElement.getLogicalTerminationPoints();
        // $scope.onfNetworkElement.ltp = undefined;
        break;
      default:
        $mwtnLog.info({component: COMPONENT, message: ['The ONF CoreModel revision', $scope.mountpoint.onfCoreModelRevision, ' is not supported (yet)!'].join(' ')});
        $scope.onfNetworkElement = {};
        $scope.onfLtps = {};
      }
      
      // update onfLTPs
      $scope.onfLtps.sort(function(a, b){
        if(order[a.getLayer()] < order[b.getLayer()]) return -1;
        if(order[a.getLayer()] > order[b.getLayer()]) return 1;
        if(a.getId() < b.getId()) return -1;
        if(a.getId() > b.getId()) return 1;
        return 0;
      });
      
      // calculate conditional packages
      $scope.pacs = {};
      $scope.onfLtps.map(function(ltp) {
        ltp.getLayerProtocols().map(
          /**
           * A function processing a layer-protocol object
           * @param {LayerProtocol} lp A layer-protocol object
           */
          function(lp) {
            var template = JSON.parse(JSON.stringify(pacTemplate));
            template['layer-protocol'] = lp.getId();
            var conditionalPackage = lp.getConditionalPackage(true);
            // console.log(conditionalPackage);
            if (conditionalPackage) {
              if ($scope.pacs[conditionalPackage] === undefined) {
                // create missing pac array
                $scope.pacs[conditionalPackage] = [];
              }
              $scope.pacs[conditionalPackage].push(template);
            } else {
              $mwtnLog.info({component: COMPONENT, message: 'The condtional package ' + conditionalPackage + ' is not supported (yet)!'});
            }
        });
      });
      
      // sort the conditional packages
      if ($scope.orderedPacs) {
        $scope.orderedPacs.filter(function(item){
          return $scope.pacs[item] !== undefined;
        }).map(function(item){
          $scope.pacs[item].sort(function(a, b){
            if(a['layer-protocol'] < b['layer-protocol']) return -1;
            if(a['layer-protocol'] > b['layer-protocol']) return 1;
            return 0;
          });
        });
      }
      data.revision = undefined;
    };

    var updateNetworkElementCurrentProblems = function(data) {
      if (!data) return;
      $scope.neCurrentProblems = data;
      var enable = $scope.neCurrentProblems.NetworkElementCurrentProblems.currentProblemList.length > 10;
      $scope.neCurrentProblemsGridOptions.columnDefs = Object.keys($scope.neCurrentProblems.NetworkElementCurrentProblems.currentProblemList[0]).map(function(field){
        var type = $scope.getType($scope.neCurrentProblems.NetworkElementCurrentProblems.currentProblemList[0][field]);
        var labelId = ['mwtn', field].join('_').toUpperCase();
        var displayName = $filter('translate')(labelId);
        var visible = true;
        if (labelId.contains('$$') || labelId === 'MWTN_SPEC') {
          visible = false;
        }
        
        return {
          field: field,
          type: type,
          displayName: displayName,
          enableSorting: enable, 
          enableFiltering:enable,
          headerCellClass: $scope.highlightFilteredHeader,
          cellClass: type,
          visible: visible,
          width: '200'
        };
      });
      $scope.neCurrentProblemsGridOptions.data = $scope.neCurrentProblems.NetworkElementCurrentProblems.currentProblemList;
    };

   var updateLtp = function(data) {
      $scope.onfLtps.map(function(ltp){
        if (ltp.getData().uuid === data.data.ltp[0].uuid) {
          ltp = new LogicalTerminationPoint(data.data.ltp[0]);
        }
      });
    };

    var updateAirInterface = function(lpId, part, data) {
      // console.log(JSON.stringify(data), lpId);
      $scope.airinterfaces.map(function(airinterface){
        // console.log(JSON.stringify(airinterface));
        if (airinterface.layerProtocol === lpId) {
          if (Object.keys(data)[0].startsWith('airInterface')) {
            airinterface[part] = data;            
          } else if (part === 'Capability') {
            // 2. PoC
            // console.log(part, JSON.stringify(data));
            airinterface[part] = data.MW_AirInterface_Pac[0].airInterfaceCapabilityList;            
          } else if (part === 'CurrentProblems') {
            // 2. PoC
            // console.log(part, JSON.stringify(data));
            airinterface[part] = data.MW_AirInterface_Pac[0].airInterfaceCurrentProblemList;            
          }
        }
      });
      data.revision = undefined;
    };

    var updateStructure = function(lpId, part, data) {
      // console.log(JSON.stringify(data), lpId);
      $scope.structures.map(function(structure){
        // console.log(JSON.stringify(structure));
        if (structure.layerProtocol === lpId) {
          if (Object.keys(data)[0] === 'info') {
            structure[part] = data;
          } else if (Object.keys(data)[0].contains('tructure')) {
            // console.log(part, data);
            structure[part] = data;            
          } else if (part === 'Capability') {
            // 2. PoC
            // console.log(part, JSON.stringify(data));
            structure[part] = data.MW_Structure_Pac[0].structureCapabilityList;            
          } else if (part === 'CurrentProblems') {
            // 2. PoC
            // console.log(part, JSON.stringify(data));
            structure[part] = data.MW_Structure_Pac[0].structureCurrentProblemList;            
          }
        }
      });
      data.revision = undefined;
    };

    var updateContainer = function(lpId, part, data) {
      // console.log(JSON.stringify(data), lpId);
      $scope.containers.map(function(container){
        // console.log(JSON.stringify(container));
        if (container.layerProtocol === lpId) {
          if (Object.keys(data)[0].contains('ontainer') ) {
            // console.log('1', data);
            container[part] = data;            
          } else if (part === 'Capability') {
            // 2. PoC
            // console.log(part, JSON.stringify(data));
            container[part] = data.MW_Container_Pac[0].containerCapabilityList;            
          } else if (part === 'CurrentProblems') {
            // 2. PoC
            // console.log(part, JSON.stringify(data));
            container[part] = data.MW_Container_Pac[0].containerCurrentProblemList;            
          }
        }
      });
      data.revision = undefined;
    };

    var updatePart = function(spec, data) {
      switch (spec.pacId) {
      case 'ne':
        updateNe(data);
        break;
      case 'neCurrentProblems':
        updateNetworkElementCurrentProblems(data);
        break;
      case 'ltp':
        updateLtp(data);
        break;
      case 'airinterface':
        // console.log(JSON.stringify(spec, JSON.stringify(data)));
        updateAirInterface(spec.layerProtocolId, spec.partId, data);
        break;
      case 'structure':
        // console.log(JSON.stringify(data));
        updateStructure(spec.layerProtocolId, spec.partId, data);
        break;
      case 'container':
        // console.log(JSON.stringify('2', data));
        updateContainer(spec.layerProtocolId, spec.partId, data);
        break;
      }
    };
    
    var getConfigDataBySpec = function(spec) {
      // console.log(spec.list, $scope[spec.list].length);
      var lists = ['airinterfaces', 'structures', 'containers'];
      var parts = ['airInterfaceConfiguration', 'pureEthernetStructureConfiguration', 'ethernetContainerConfiguration'];
      var index = lists.indexOf(spec.list);
      var result;
      $scope[spec.list].map(function(obj){
        // console.log(obj.layerProtocol, spec.lp, obj.layerProtocol === spec.lp);
        if (obj.layerProtocol === spec.lp) {
          // console.log(index, parts[index], obj.Configuration[parts[index]], JSON.stringify(obj) );
          result = obj.Configuration[parts[index]];
        }
      });
      return result;
    };
        
    var getLayerByListId = function(listId) {
      var lists = ['airinterfaces', 'structures', 'containers', 'conatiners']; // TODO TDM
      var layers = ['MWPS', 'MWS', 'ETH', 'TDM'];
      return layers[lists.indexOf(listId)];
    };
    
    $scope.openConfigView = function(spec) {
      spec.nodeId = $scope.networkElement;
      spec.revision = $scope.revision;
      spec.layer = getLayerByListId(spec.list);
      // console.log('openConfigView', JSON.stringify(spec));

      var modalInstance = $uibModal.open({
        animation: true,
        ariaLabelledBy: 'modal-title',
        ariaDescribedBy: 'modal-body',
        templateUrl: 'src/app/mwtnConfig/templates/openConfigView.html',
        controller: 'ShowConfigurationCtrl',
        size: 'huge',
        resolve: {
          object: function () {
            return {path:spec, data:getConfigDataBySpec(spec)};
          }
        }
      });

      modalInstance.result.then(function(object) {
        // update
        var spec = {
          nodeId: $scope.networkElementId,
          revision: $scope.revision,
          pacId: object.path.list.slice(0, -1),
          layer: $mwtnConfig.getLayer(object.path.list.slice(0, -1)),
          layerProtocolId: object.path.lp,
          partId: 'Configuration'
        };
        $mwtnConfig.getPacParts(spec).then(function(success){
          // console.log('3', success);
          updatePart(spec, $mwtnConfig.yangifyObject(success));
        }, function(error){
          updatePart(spec, error);
        });

        // $mwtnLog.info({component: COMPONENT, message: 'Mount result: ' + JSON.stringify(netconfServer)});
      }, function () {
        // $mwtnLog.info({component: COMPONENT, message: 'Creation of new planned NetworkElement dismissed!'});
      });
      
    };
    
    // events
    $scope.status = {};
    $scope.spinner = {ne:false};
    $scope.separator = $mwtnConfig.separator; //'&nbsp;'
    
    $scope.$watch('status', function(status, oldValue) {
      Object.keys(status).map(function(key){
        if ($scope.networkElementId && status[key] && status[key] !== oldValue[key]) {
          
          $scope.spinner[key] = true;
          var info = key.split($scope.separator);

          // collabs all others, because they may oudated.
          if (info[0] === 'ne') {
            Object.keys($scope.status).map(function(group){
              if (group !== 'ne')
              $scope.status[group] = false;
            });
          }
          var spec = {
            nodeId: $scope.networkElementId,
            revision: $scope.revision,
            pacId: info[0],
            layer: $mwtnConfig.getLayer(info[0]),
            layerProtocolId: info[1],
            partId: info[2]
          };
          $mwtnConfig.getPacParts(spec).then(function(success){

            // console.log('4', success);
            $scope.spinner[key] = false;
            updatePart(spec, $mwtnConfig.yangifyObject(success));
          }, function(error){
            $scope.spinner[key] = false;
            updatePart(spec, error);
          });
          $scope.path = spec;
        }
      });   
    }, true);
    
    $scope.collapseAll = function(except) {
      // close all groups
      Object.keys($scope.status).map(function(group){
        $scope.status[group] = false;
      });
      Object.keys($scope.spinner).map(function(group){
        $scope.spinner[group] = false;
      });
    };
    
    var clearNetworkElementData = function() {
      $scope.onfNetworkElement = undefined;
      $scope.onfLtps = [];
      $scope.airinterfaces = [];
      $scope.structures = [];
      $scope.containers = [];
    };
    
    $scope.$watch('networkElement', function(neId, oldValue) {
      if (neId && neId !== '' && neId !== oldValue) {
        var revision;
        $scope.networkElements.map(function(ne){
          if (ne.id === neId) revision = ne.revision;
        });
        $scope.networkElementId = neId;
        $scope.revision = revision;

        var neAlarms = $scope.mountPoints.filter(function(mountpoint){
          return mountpoint['node-id'] === neId;
        }).map(function(mountpoint){
          return mountpoint.onfCapabilities.filter(function(cap){
            return cap.module === 'MicrowaveModel-NetworkElement-CurrentProblemList' || cap.module === 'onf-core-model-conditional-packages';
          });
        });
        if (neAlarms.length === 1 && neAlarms[0].length === 1 ) {
          $scope.neCurrentProblems = 'loading...';
        } else {
          $scope.neCurrentProblems = undefined;
        }

        var spec = {
          nodeId: neId,
          revision: revision,
          pacId: 'ne'
        };
        clearNetworkElementData();
        $scope.loading = true;
        $scope.unexpected = false;
        $mwtnConfig.getPacParts(spec).then(function(success){
          $scope.loading = true;
          $scope.jsonData=success;
          updatePart(spec, $mwtnConfig.yangifyObject(success));
        }, function(error){
          $scope.loading = false;
          $scope.unexpected = true;
          updatePart(spec, error);
        });
        $scope.path = spec;
      }
    });

  }]);

  mwtnConfigApp.register.controller('ShowListCtrl', ['$scope', '$uibModalInstance', '$uibModal', '$filter', '$mwtnConfig', 'listData', 
                                                     function ($scope, $uibModalInstance, $uibModal, $filter, $mwtnConfig, listData) {

    $scope.path = listData.path;
    $scope.listData = listData.listData;
    $scope.gridOptions = JSON.parse(JSON.stringify($mwtnConfig.gridOptions));
    $scope.highlightFilteredHeader = $mwtnConfig.highlightFilteredHeader;

//    $scope.gridOptions.rowTemplate = rowTemplate;
    
    $scope.getType = $mwtnConfig.getType;

    var getCellTemplate = function(type) {
      switch (type) {
      case 'array':
        // path, grid.getCellValue(row, col)
        return ['<button ng-click="grid.appScope.showArray(grid.appScope.path, grid.getCellValue(row, col), row.entity)" class="btn btn-primary">{{\'MWTN_SHOWLIST\' | translate}}: {{grid.getCellValue(row, col).length}}  {{\'MWTN_ITEMS\'| translate}}...</button>'
                ].join('');
      case 'object':
        return ['<button ng-click="grid.appScope.showObject(grid.appScope.path, grid.getCellValue(row, col), row.entity)" class="btn btn-primary">{{\'MWTN_SHOWOBJECT\' | translate}}...</button>'].join('');
      default:
        return undefined;
      }
    };

    var enable = $scope.listData.length > 10;
    if ($scope.listData.length > 0 && $scope.getType($scope.listData[0]) === 'object') {
      $scope.gridOptions.columnDefs = Object.keys($scope.listData[0]).map(function(field){
        var type = $scope.getType($scope.listData[0][field]);
        var labelId = ['mwtn', field].join('_').toUpperCase();
        var displayName = $filter('translate')(labelId);
        var visible = true;
        if (labelId.contains('$$') || labelId === 'MWTN_SPEC') {
          visible = false;
        }
        
        return {
          field: field,
          type: type,
          displayName: displayName,
          enableSorting: enable, 
          enableFiltering:enable,
          headerCellClass: $scope.highlightFilteredHeader,
          cellTemplate: getCellTemplate(type),
          cellClass: type,
          visible: visible
        };
      });
      $scope.gridOptions.data = $scope.listData;
    }

    $scope.ok = function () {
      $uibModalInstance.close($scope.listData);
    };
  
    $scope.cancel = function () {
      $uibModalInstance.dismiss('cancel');
    };

    $scope.showArray = function(path, attribute, row) {
      $scope.path =  path;
      $scope.path.row = Object.keys(row)[0];
      $scope.path.value = row[Object.keys(row)[0]];
      
      // $scope.path.attribute = attribute.name,
      $scope.listData = attribute; // which is an array
      var modalInstance = $uibModal.open({
        animation: true,
        ariaLabelledBy: 'modal-title',
        ariaDescribedBy: 'modal-body',
        templateUrl: 'src/app/mwtnConfig/templates/showArray.html',
        controller: 'ShowListCtrl',
        size: 'huge',
        resolve: {
          listData: function () {
            console.log('new path', $scope.path);
            return {path:$scope.path, listData:$scope.listData};
          }
        }
      });

      modalInstance.result.then(function (listData) {
        // $mwtnLog.info({component: COMPONENT, message: 'Mount result: ' + JSON.stringify(netconfServer)});
      }, function () {
        // $mwtnLog.info({component: COMPONENT, message: 'Creation of new planned NetworkElement dismissed!'});
      });
    };
    
    $scope.showObject = function(path, objValue, row) {
      $scope.path =  path;
      $scope.path.row = Object.keys(row)[0];
      $scope.path.value = row[Object.keys(row)[0]];
      $scope.objValue = objValue;
      
      var modalInstance = $uibModal.open({
        animation: true,
        ariaLabelledBy: 'modal-title',
        ariaDescribedBy: 'modal-body',
        templateUrl: 'src/app/mwtnConfig/templates/showObject.html',
        controller: 'ShowListCtrl',
        size: 'md',
        resolve: {
          listData: function () {
            return {path:$scope.path, objValue:$scope.objValue};
          }
        }
      });

      modalInstance.result.then(function (objValue) {
        // $mwtnLog.info({component: COMPONENT, message: 'Mount result: ' + JSON.stringify(netconfServer)});
      }, function () {
        // $mwtnLog.info({component: COMPONENT, message: 'Creation of new planned NetworkElement dismissed!'});
      });
    };

}]);

  mwtnConfigApp.register.controller('ShowListCtrl', ['$scope', '$uibModalInstance', '$uibModal', '$filter', '$mwtnCommons', '$mwtnLog', '$mwtnConfig', 'listData', 
                                                     function ($scope, $uibModalInstance, $uibModal, $filter, $mwtnCommons, $mwtnLog, $mwtnConfig, listData) {
 
    var COMPONENT = 'ShowListCtrl'; 
    
    $scope.path = listData.path;
    $scope.data = listData.data;
    $scope.listData = listData.listData;
    $scope.gridOptions = JSON.parse(JSON.stringify($mwtnCommons.gridOptions));
    $scope.highlightFilteredHeader = $mwtnCommons.highlightFilteredHeader;

    $scope.getType = $mwtnConfig.getType;
    $scope.severities = [ "non-alarmed", "warning", "minor", "major", "critical" ];

    var getCellTemplate = function(partId, field, type) {
      // console.log(partId, field, type);
      if (partId === 'Configuration' && field === 'problemKindSeverity') {
        return ['<div class="form-group">',
                '  <select class="form-control" ng-model="MODEL_COL_FIELD">',
                '    <option ng-repeat="option in grid.appScope.severities track by $index" value="{{option}}">{{option}}</option>',
                '  </select>',
                '</div>'].join('');
      }
      switch (type) {
      case 'array':
        // path, grid.getCellValue(row, col)
        return ['<button ng-click="grid.appScope.showArray(grid.appScope.path, grid.getCellValue(row, col), row.entity)" class="btn btn-primary">{{\'MWTN_SHOWLIST\' | translate}}: {{grid.getCellValue(row, col).length}}  {{\'MWTN_ITEMS\'| translate}}...</button>'
                ].join('');
      case 'object':
        return ['<button ng-click="grid.appScope.showObject(grid.appScope.path, grid.getCellValue(row, col), row.entity)" class="btn btn-primary">{{\'MWTN_SHOWOBJECT\' | translate}}...</button>'].join('');
      default:
        return undefined;
      }
    };

    var enable = $scope.listData.length > 10;
    if ($scope.listData.length > 0 && $scope.getType($scope.listData[0]) === 'object') {
      $scope.gridOptions.columnDefs = Object.keys($scope.listData[0]).map(function(field){
        var type = $scope.getType($scope.listData[0][field]);
        var labelId = ['mwtn', field].join('_').toUpperCase();
        var displayName = $filter('translate')(labelId);
        var visible = true;
        if (labelId.contains('$$') || labelId === 'MWTN_SPEC') {
          visible = false;
        }
        
        return {
          field: field,
          type: type,
          displayName: displayName,
          enableSorting: true, 
          enableFiltering:enable,
          headerCellClass: $scope.highlightFilteredHeader,
          cellTemplate: getCellTemplate($scope.path.partId, field, type),
          cellClass: type,
          visible: visible
        };
      });
      $scope.gridOptions.data = $scope.listData;
    }

    $scope.ok = function () {
      $scope.processing = true;
      $mwtnConfig.setPacPartLists($scope.path, $scope.listData).then(function(success){
        $scope.applied = {text: 'Applied: ' + new Date().toISOString(), class:'mwtnSuccess'};
        $scope.processing = false;
      }, function(error){
        $scope.applied = {text: 'Error: ' + new Date().toISOString(), class:'mwtnError'};
        $scope.processing = false;
        $mwtnLog.error({component: COMPONENT, message: JSON.stringify(error)});
      });

    };
  
    $scope.cancel = function () {
      $uibModalInstance.dismiss('cancel');
    };

    $scope.showArray = function(path, attribute, row) {
      $scope.path =  path;
      $scope.path.row = Object.keys(row)[0];
      $scope.path.value = row[Object.keys(row)[0]];
      
      // $scope.path.attribute = attribute.name,
      $scope.listData = attribute; // which is an array
      var modalInstance = $uibModal.open({
        animation: true,
        ariaLabelledBy: 'modal-title',
        ariaDescribedBy: 'modal-body',
        templateUrl: 'src/app/mwtnConfig/templates/showArray.html',
        controller: 'ShowListCtrl',
        size: 'huge',
        resolve: {
          listData: function () {
            console.log('new path', $scope.path);
            return {path:$scope.path, data:$scope.data, listData:$scope.listData};
          }
        }
      });

      modalInstance.result.then(function (listData) {
        // $mwtnLog.info({component: COMPONENT, message: 'Mount result: ' + JSON.stringify(netconfServer)});
      }, function () {
        // $mwtnLog.info({component: COMPONENT, message: 'Creation of new planned NetworkElement dismissed!'});
      });
    };
    
    $scope.showObject = function(path, objValue, row) {
      $scope.path =  path;
      $scope.path.row = Object.keys(row)[0];
      $scope.path.value = row[Object.keys(row)[0]];
      $scope.objValue = objValue;
      
      var modalInstance = $uibModal.open({
        animation: true,
        ariaLabelledBy: 'modal-title',
        ariaDescribedBy: 'modal-body',
        templateUrl: 'src/app/mwtnConfig/templates/showObject.html',
        controller: 'ShowObjectCtrl',
        size: 'md',
        resolve: {
          objValue: function () {
            return {path:$scope.path, objValue:$scope.objValue};
          }
        }
      });

      modalInstance.result.then(function (objValue) {
        // $mwtnLog.info({component: COMPONENT, message: 'Mount result: ' + JSON.stringify(netconfServer)});
      }, function () {
        // $mwtnLog.info({component: COMPONENT, message: 'Creation of new planned NetworkElement dismissed!'});
      });
    };

  }]);

  mwtnConfigApp.register.controller('ShowObjectCtrl', ['$scope', '$uibModalInstance', '$mwtnCommons', '$mwtnConfig', 'orderByFilter', 'objValue', 
                                                       function ($scope, $uibModalInstance, $mwtnCommons, $mwtnConfig, orderBy, objValue) {

      $scope.path = objValue.path;
      $scope.objValue = objValue.objValue;
      
      $scope.schema = {initShowObjectCtrl:false};
      $mwtnConfig.getSchema().then(function(data){
        $scope.schema = data;

        var attributes = Object.keys($scope.objValue).map(function(parameter) {
          // console.log($scope.schema[parameter]);
          if ($scope.schema[parameter]) {
            // console.log($scope.schema[parameter]);
            return {
              name: parameter,
              value: $scope.objValue[parameter],
              order: $scope.schema[parameter]['order-number'],
              unit:  $scope.schema[parameter].unit,
            };
          } else {
            return {
              name: parameter,
              value: $scope.objValue[parameter],
              order: 0,
              unit:  '',
            };
          }
        });
        
        $scope.attributes =  orderBy(attributes, 'order', false);

      }, function(error){
        console.log('bad luck - no schema ;( ');
      });

      $scope.ok = function () {
        $uibModalInstance.close($scope.objValue);
      };
    
      $scope.cancel = function () {
        $uibModalInstance.dismiss('cancel');
      };

  }]);

  mwtnConfigApp.register.controller('ShowConfigurationCtrl', ['$scope', '$uibModalInstance', '$mwtnCommons', '$mwtnConfig', '$mwtnLog', 'orderByFilter', 'object', 
                                                       function ($scope, $uibModalInstance, $mwtnCommons, $mwtnConfig, $mwtnLog, orderBy, object) {

      var COMPONENT = 'ShowConfigurationCtrl';
      
      $scope.object = object;
      $scope.getType = $mwtnConfig.getType;
      
      var controlTypes = ['text', 'number', 'number','number', 'checkbox'];
      var umlTypes = ['pathmap://UML_LIBRARIES/UMLPrimitiveTypes.library.uml#String', 
                      'pathmap://UML_LIBRARIES/UMLPrimitiveTypes.library.uml#Integer',
                      'pathmap://UML_LIBRARIES/EcorePrimitiveTypes.library.uml#EByte',
                      'pathmap://UML_LIBRARIES/EcorePrimitiveTypes.library.uml#EShort',
                      'pathmap://UML_LIBRARIES/UMLPrimitiveTypes.library.uml#Boolean'];

      var getControlType = function(umlType) {
        var result = controlTypes[umlTypes.indexOf(umlType)];
        if (!result) {
          console.log(umlType);
          result = 'text';
        }
        return result;
      };
      
      $scope.schema = {initShowObjectCtrl:false};
      var processAttributes = function() {
        var getControlType = function(umlType) {
          var result = controlTypes[umlTypes.indexOf(umlType)];
          if (!result) {
            // console.log($scope.schema[umlType]);
            result = $scope.schema[umlType].enum;
          }
          return result;
        };
        
        // console.log(JSON.stringify($scope.object.data));
        var attributes = Object.keys($scope.object.data).map(function(parameter) {
          // console.log($scope.schema[parameter]);
          if ($scope.schema[parameter]) {
            // console.log($scope.schema[parameter], $scope.getType($scope.object.data[parameter]));
            if ($scope.getType($scope.object.data[parameter]) !== 'array') {
              return {
                name: parameter,
                value: $scope.object.data[parameter],
                order: $scope.schema[parameter]['order-number'],
                unit:  $scope.schema[parameter].unit,
                controltype:  getControlType($scope.schema[parameter].type)
              };
            }
          } else {
            return {
              name: parameter,
              value: $scope.object.data[parameter],
              order: 0,
              unit:  '',
            };
          }
        });
        
        $scope.attributes =  orderBy(attributes.clean(null), 'order', false);
        // console.log(JSON.stringify($scope.attributes));
      };
      
      $mwtnConfig.getSchema().then(function(data){
        $scope.schema = data;
        processAttributes();
      }, function(error){
        console.log('bad luck - no schema ;( ');
        processAttributes();
      });

      $scope.ok = function () {
        
        // clone would make sence, when PATCH is implemented in ODL RestConf
        // var clone = JSON.parse(JSON.stringify($scope.object.data));
        $scope.attributes.map(function(attribute){
          if (attribute && $scope.object.data[attribute.name] !== attribute.value) { //&& $mwtnComments.getType(attribute.value) !== 'array') {
            // clone[attribute.name] = attribute.value;
            $scope.object.data[attribute.name] = attribute.value;
          } // else {
            // clone[attribute.name] = undefined;
          // }
        });
        
        var spec = {
            nodeId: $scope.object.path.nodeId,
            revision: $scope.object.path.revision,
            pacId: $scope.object.path.list.slice(0, -1),
            layer: $mwtnConfig.getLayer($scope.object.path.list.slice(0, -1)),
            layerProtocolId: $scope.object.path.lp,
            partId: 'Configuration'
          };
        $scope.processing = true;
        // console.log(JSON.stringify(clone));
        $mwtnConfig.setPacParts(spec, $scope.object.data).then(function(success){
          $scope.applied = {text: 'Applied: ' + new Date().toISOString(), class:'mwtnSuccess'};
          $scope.processing = false;
        }, function(error){
          $scope.applied = {text: 'Error: ' + new Date().toISOString(), class:'mwtnError'};
          $scope.processing = false;
          $mwtnLog.error({component: COMPONENT, message: JSON.stringify(error)});
        });
        
      };
    
      $scope.cancel = function () {
        $uibModalInstance.close($scope.object);
        //$uibModalInstance.dismiss('cancel');
      };

  }]);

});
