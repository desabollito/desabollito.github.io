var localidadsServices = angular.module('localidadServices', ['app.services']);

localidadsServices.factory('localidad', ['baseDataService',
	function (baseDataService) {
	    return baseDataService.getService('api/localidades', false, {
	        query: { method: 'GET', url: 'api/provincias/:id/localidades', params: { id: '@id' }, isArray: true },
	    });
	}]);
