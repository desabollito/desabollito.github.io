var provinciasServices = angular.module('provinciaServices', ['app.services']);

provinciasServices.factory('provincia', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/provincias', false, {
	    });
	}]);
